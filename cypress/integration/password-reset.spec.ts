/**
 * Cypress E2E — Password Reset Flow
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1 Independent Test, §SC-001
 * Quickstart: specs/005-transactional-email-reset/quickstart.md §Verifying the acceptance criteria
 * Research: specs/005-transactional-email-reset/research.md §D9 (Cypress reads sentEmails buffer)
 *
 * Covers:
 *   US1 AC1 — Forgot password → generic 'check your email' confirmation
 *   US1 AC2 — Unknown email → same generic confirmation (SC-004, no account enumeration)
 *   US1 AC3 — Valid reset link → set new password → sign in works (SC-001)
 *   US1 AC4 — Old password rejected after successful reset (SC-001)
 *   US1 AC5 — 'Continue to sign in' button navigates back to sign-in
 *   US1 AC6 — Invalid/expired token → link expired error message shown (FR-010)
 *   Navigation — /reset-password without token → form renders; submit shows error
 *
 * Token strategy (research.md §D9 — cross-process strategy for Cypress):
 *   The test server runs with NODE_ENV=test, selecting MemoryEmailTransport.
 *   GET /api/test/sent-emails exposes the sentEmails buffer so tests can parse
 *   the reset token from the email link without stdout parsing.
 *   sendResetPassword is fire-and-forget, so we poll until the email appears.
 *
 * Test isolation:
 *   The global beforeEach in cypress/support/e2e.js resets domain storage via
 *   cy.resetDatabase(). The better-auth tables (user, account, etc.) are NOT
 *   reset between tests. Tests that need a fresh account create one via the
 *   invitation flow with uniqueEmail() to avoid cross-test conflicts.
 */

/// <reference types="cypress" />

// ─── Helpers ─────────────────────────────────────────────────────────────────

let emailCounter = 0;

/** Generate a unique email address for each test to avoid cross-run conflicts. */
function uniqueEmail(prefix: string): string {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.com`;
}

/** Clear the MemoryEmailTransport sentEmails buffer. */
function clearSentEmails(): Cypress.Chainable {
  return cy.request("POST", "/api/test/clear-emails");
}

interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Poll GET /api/test/sent-emails until an email to `to` appears.
 * Returns the email record via cy.wrap().
 * Necessary because sendResetPassword is fire-and-forget: the HTTP 200 returns
 * before the background task (throttle → supersession → send) completes.
 */
function waitForResetEmailTo(
  to: string,
  retries = 50,
  interval = 100
): Cypress.Chainable<SentEmail> {
  if (retries === 0) throw new Error(`No reset email to ${to} found after retries`);
  return cy.request<SentEmail[]>("/api/test/sent-emails").then((resp) => {
    const found = resp.body.find((e) => e.to.toLowerCase() === to.toLowerCase());
    if (found) return cy.wrap(found);
    return cy.wait(interval).then(() => waitForResetEmailTo(to, retries - 1, interval));
  });
}

/**
 * Parse the reset token from a password-reset email's plain-text body.
 * The link format (passwordResetEmail.ts) is:
 *   <baseUrl>/reset-password?token=<urlEncodedToken>
 */
function parseResetToken(email: SentEmail): string {
  const match = email.text.match(/[?&]token=([^\s&]+)/);
  if (!match) throw new Error(`No ?token= found in email text:\n${email.text}`);
  return decodeURIComponent(match[1]);
}

/**
 * Create a fresh test user via the invitation flow.
 * Requires an active admin session (call cy.login() in beforeEach first).
 */
function createTestUser(email: string, password: string): Cypress.Chainable {
  return cy
    .request<{ link: string }>("POST", "/api/admin/invitations", { email, role: "standard" })
    .then((resp) => {
      const token = resp.body.link.split("/invitation/")[1];
      return cy.request("POST", "/api/auth/invitation/accept", {
        token,
        password,
        name: "Reset Test User",
      });
    });
}

// ─── US1 AC1+AC2 — Forgot-password page and generic confirmation ─────────────

describe("US1 — Forgot-password navigation and generic confirmation", () => {
  beforeEach(() => {
    clearSentEmails();
  });

  it("navigates from sign-in to /forgot-password via the 'Forgot password?' link", () => {
    cy.visit("/");
    cy.contains("a", "Forgot password?").click();
    cy.url().should("include", "/forgot-password");
    cy.contains("Forgot password").should("exist");
  });

  it("shows generic 'check your email' confirmation for a known email (AC1)", () => {
    cy.visit("/forgot-password");
    cy.inLabel("Email address").type(Cypress.env("adminEmail"));
    cy.contains("button", "Send reset link").click();

    // Generic confirmation shown regardless of whether account exists (FR-007)
    cy.contains("Check your email").should("exist");
    cy.contains(
      "If that address is registered, we've sent a password reset link. Check your email."
    ).should("exist");
  });

  it("shows the same generic confirmation for an unknown email (AC2, SC-004 — no account enumeration)", () => {
    cy.visit("/forgot-password");
    cy.inLabel("Email address").type("nobody-pr-unknown-xyz@example.com");
    cy.contains("button", "Send reset link").click();

    // Identical confirmation — no indication that the account is missing (FR-007/SC-004)
    cy.contains("Check your email").should("exist");
    cy.contains(
      "If that address is registered, we've sent a password reset link. Check your email."
    ).should("exist");
  });
});

// ─── US1 AC3+AC4 — Full reset flow: new password works, old rejected (SC-001) ─

describe("US1 — Full reset flow: set new password, old rejected (SC-001, SC-005)", () => {
  beforeEach(() => {
    cy.login();
    clearSentEmails();
  });

  it(
    "full reset journey: forgot-password → check-email confirmation → " +
      "navigate to reset link → set new password → old rejected, new works (SC-001)",
    () => {
      const email = uniqueEmail("pr-full");
      const oldPassword = "OldResetPass123!";
      const newPassword = "NewResetPass456!";

      // Create a test user so the admin password stays unchanged
      createTestUser(email, oldPassword);
      // Clear the invitation email so only the reset email appears in the buffer
      clearSentEmails();

      // The beforeEach cy.login() authenticated the shared cookie jar as admin so we could
      // create the test user. Sign out before driving the logged-out reset UI (mirrors translate.spec.js).
      cy.request("POST", "/api/auth/sign-out");

      // Step 1: Navigate to forgot-password via the sign-in page link
      cy.visit("/");
      cy.contains("a", "Forgot password?").click();
      cy.url().should("include", "/forgot-password");

      // Step 2: Submit the test user's email
      cy.inLabel("Email address").type(email);
      cy.contains("button", "Send reset link").click();

      // Generic confirmation shown
      cy.contains("Check your email").should("exist");

      // Step 3: Read the reset token from the MemoryEmailTransport buffer (research §D9)
      waitForResetEmailTo(email).then((resetEmail) => {
        const token = parseResetToken(resetEmail);

        // Step 4: Navigate to the reset-password page with the token
        cy.visit(`/reset-password?token=${encodeURIComponent(token)}`);
        cy.contains("Reset your password").should("exist");

        // Step 5: Enter new password and submit
        cy.inLabel("New password").type(newPassword);
        cy.contains("button", "Set new password").click();

        // Step 6: Success state shown with 'Continue to sign in' button visible
        cy.contains("Password changed").should("exist");
        cy.contains(
          "Your password has been successfully reset. You can now sign in with your new password."
        ).should("exist");
        cy.contains("button", "Continue to sign in").should("exist");

        // Step 7: Confirm old password is rejected at sign-in (FR-009)
        cy.request({
          method: "POST",
          url: "/api/auth/sign-in/email",
          body: { email, password: oldPassword },
          failOnStatusCode: false,
        }).then((resp) => {
          expect(resp.status).to.eq(401);
        });

        // Step 8: Confirm new password signs in successfully (SC-001)
        cy.request({
          method: "POST",
          url: "/api/auth/sign-in/email",
          body: { email, password: newPassword },
        }).then((resp) => {
          expect(resp.status).to.eq(200);
          expect(resp.body.user.email).to.eq(email);
        });
      });
    }
  );

  it("'Continue to sign in' button navigates back to the sign-in page", () => {
    const email = uniqueEmail("pr-continue");
    const oldPassword = "OldContPass123!";
    const newPassword = "NewContPass456!";

    createTestUser(email, oldPassword);
    clearSentEmails();

    // The beforeEach cy.login() authenticated the shared cookie jar as admin so we could
    // create the test user. Sign out before driving the logged-out reset UI (mirrors translate.spec.js).
    cy.request("POST", "/api/auth/sign-out");

    // Request reset via API (faster than UI for this subsidiary test)
    cy.request("POST", "/api/auth/request-password-reset", { email });

    waitForResetEmailTo(email).then((resetEmail) => {
      const token = parseResetToken(resetEmail);

      cy.visit(`/reset-password?token=${encodeURIComponent(token)}`);
      cy.inLabel("New password").type(newPassword);
      cy.contains("button", "Set new password").click();

      cy.contains("Password changed").should("exist");
      // Click the Continue to sign in button
      cy.contains("button", "Continue to sign in").click();

      // Should land back on the sign-in page (base URL root)
      cy.url().should("eq", `${Cypress.config("baseUrl")}/`);
      cy.contains("button", "Log In").should("exist");
    });
  });
});

// ─── US1 AC5 — Invalid/expired token → link expired error ────────────────────

describe("US1 — /reset-password with invalid or missing token → error shown", () => {
  it("shows the form (empty token) when navigating to /reset-password with no token", () => {
    cy.visit("/reset-password");
    // The form renders; submitting with an empty token produces INVALID_TOKEN error
    cy.contains("Reset your password").should("exist");
    cy.inLabel("New password").type("SomeNewPass123!");
    cy.contains("button", "Set new password").click();

    // Invalid token → link expired state (FR-010)
    cy.contains("Link expired").should("exist");
    cy.contains(
      "This reset link is no longer valid. It may have already been used or has expired."
    ).should("exist");
    // Option to request a new link is shown
    cy.contains("Request a new link").should("exist");
  });

  it("shows 'link expired' error for a bad token in the URL (FR-010)", () => {
    cy.visit("/reset-password?token=completely-invalid-token-xyz");
    cy.inLabel("New password").type("SomeNewPass123!");
    cy.contains("button", "Set new password").click();

    // Invalid token → link expired state (FR-010)
    cy.contains("Link expired").should("exist");
    cy.contains(
      "This reset link is no longer valid. It may have already been used or has expired."
    ).should("exist");
    cy.contains("Request a new link").should("exist");
  });
});
