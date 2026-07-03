/**
 * Cypress E2E — User Account Management
 *
 * Spec: specs/006-user-account-management/spec.md §US1..US4 + Acceptance Scenarios
 * Plan: plan.md §Constitution Check §I (E2E for user-facing flows required by Principle I)
 * Reference: mirrors cypress/integration/login.spec.js for admin sign-in setup and
 *   cypress/integration/invitation-system.spec.js for admin-area navigation,
 *   management-list patterns, and the two-step inline-confirm pattern.
 *
 * Covers:
 *   US1 — Roster: all columns shown, own row marked "You", a deactivated
 *         account still appears (not hidden)
 *   US2 — Deactivate/Reactivate: self-lockout guard; deactivate blocks
 *         sign-in, reactivate restores it
 *   US3 — Promote/Demote: last-admin guard on Demote; promote (no confirm) /
 *         demote (two-step confirm) round trip
 *   US4 — Force sign-out: ends an active session while the account stays
 *         Active; the user can sign back in afterward
 *   Access control — a signed-in Standard user hitting /admin/users never
 *         sees the roster
 *
 * A note on what is deliberately NOT re-tested here: the "last remaining
 * Admin" guard rejecting an action on an admin OTHER than the operator (spec
 * §Acceptance Scenario US2-3, US3-3) can only be reached in a real browser
 * session via a genuine concurrent race (two admins racing to remove each
 * other) — the operator's own session always counts toward the active-admin
 * total, so a different target can never be "the last admin" while a
 * legitimately-authorized (and therefore still-active-admin) operator is the
 * one making the request. That race is exhaustively covered at the store and
 * HTTP-integration layers (src/server/auth/userStore.test.ts "under
 * concurrency..." and src/server/controllers/usersController.test.ts "409:
 * deactivating/demoting the last remaining active admin..."). This file
 * instead exercises the guard the way a real operator can actually trigger
 * it: on their own row, when they are the sole remaining active admin.
 *
 * Test isolation: each test uses a unique email address derived from the
 * test name's index so multiple runs do not conflict on the auth-owned user
 * table (which is not reset by /api/test/reset-storage — mirrors
 * invitation-system.spec.js).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PASSWORD = "StrongP@ss1!";

let emailCounter = 0;
function uniqueEmail(prefix) {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.com`;
}

// Create an invitation via the admin API and return the full response body
// (including the link with the raw token). Mirrors invitation-system.spec.js.
function apiCreateInvitation(email, role) {
  role = role ?? "standard";
  return cy.request("POST", "/api/admin/invitations", { email, role }).then((resp) => resp.body);
}

// Create + immediately redeem an invitation, producing a real signed-up
// account with a known password. Returns { email, password, name }.
function createAccount(prefix, role) {
  const email = uniqueEmail(prefix);
  const name = `${prefix} User`;
  return apiCreateInvitation(email, role).then((invitation) => {
    const token = invitation.link.split("/invitation/")[1];
    return cy
      .request("POST", "/api/auth/invitation/accept", { token, password: PASSWORD, name })
      .then(() => ({ email, password: PASSWORD, name }));
  });
}

// ---------------------------------------------------------------------------
// US1 — Roster
// ---------------------------------------------------------------------------
describe("US1 — Roster", () => {
  beforeEach(cy.login);

  it("lists all accounts with name, email, role, status, created date, and marks the operator's own row", () => {
    createAccount("us1-roster", "standard").then(({ email, name }) => {
      cy.visit("/admin/users");

      cy.contains("h1", "Users").should("exist");
      cy.contains("th", "Name").should("exist");
      cy.contains("th", "Email").should("exist");
      cy.contains("th", "Role").should("exist");
      cy.contains("th", "Status").should("exist");
      cy.contains("th", "Created").should("exist");

      // The operator's own row is visually/textually distinguished (scenario 2)
      cy.contains("tr", Cypress.env("adminEmail")).within(() => {
        cy.contains("td", "(You)").should("exist");
        cy.contains("td", "Administrator").should("exist");
        cy.contains("td", "Active").should("exist");
      });

      // The freshly-created account appears with its role/status (scenario 1)
      cy.contains("tr", email).within(() => {
        cy.contains("td", name).should("exist");
        cy.contains("td", "Standard").should("exist");
        cy.contains("td", "Active").should("exist");
      });
    });
  });

  it("still shows a previously-deactivated account in the roster, marked Deactivated (not hidden)", () => {
    createAccount("us1-deactivated", "standard").then(({ email }) => {
      cy.request("GET", "/api/admin/users").then((resp) => {
        const target = resp.body.find((user) => user.email === email);
        cy.request("POST", `/api/admin/users/${target.id}/deactivate`);
      });

      cy.visit("/admin/users");
      cy.contains("tr", email).within(() => {
        cy.contains("td", "Deactivated").should("exist");
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Access control — a signed-in Standard user is blocked from the screen
// ---------------------------------------------------------------------------
describe("Access control", () => {
  it("blocks a signed-in Standard user from the user-management screen (no roster data visible)", () => {
    cy.login();
    createAccount("access-standard", "standard").then(({ email, password }) => {
      cy.request("POST", "/api/auth/sign-in/email", { email, password });

      cy.visit("/admin/users");

      // The admin-only route doesn't exist for a non-admin user — MainRouter's
      // catch-all renders the signed-in (non-admin) home instead of the roster.
      cy.contains("h1", "Users").should("not.exist");
      cy.contains("th", "Email").should("not.exist");
      cy.contains(email).should("not.exist");
    });
  });
});

// ---------------------------------------------------------------------------
// US2 — Deactivate and reactivate account access
// ---------------------------------------------------------------------------
describe("US2 — Deactivate and reactivate account access", () => {
  beforeEach(cy.login);

  it("always disables Deactivate on the operator's own row, with a visible reason (self-lockout guard, scenario 4)", () => {
    cy.visit("/admin/users");
    cy.contains("tr", Cypress.env("adminEmail")).within(() => {
      cy.contains("button", "Deactivate").should("be.disabled");
    });
    cy.contains("Cannot deactivate your own account").should("exist");
  });

  it("deactivates an account behind a two-step confirm, blocking sign-in, then reactivating restores sign-in (scenarios 1, 2, 5)", () => {
    createAccount("us2-deactivate", "standard").then(({ email, password }) => {
      cy.visit("/admin/users");

      cy.intercept("POST", /\/api\/admin\/users\/.+\/deactivate/).as("deactivate");
      cy.contains("tr", email).within(() => {
        cy.contains("button", "Deactivate").click();
        cy.contains("button", "Confirm deactivate").click();
      });
      cy.wait("@deactivate").its("response.statusCode").should("eq", 200);

      cy.contains("tr", email).within(() => {
        cy.contains("td", "Deactivated").should("exist");
        cy.contains("button", "Reactivate").should("exist");
      });

      // A separate (logged-out) session cannot sign in with the deactivated
      // account's credentials.
      cy.clearCookie("better-auth.session_token");
      cy.visit("/");
      cy.placeholder("Email").type(email);
      cy.placeholder("Password").type(password);
      cy.contains("button", "Log In").click();
      cy.contains("Login failed").should("exist");

      // Reactivate as the administrator.
      cy.login();
      cy.visit("/admin/users");
      cy.intercept("POST", /\/api\/admin\/users\/.+\/reactivate/).as("reactivate");
      cy.contains("tr", email).within(() => {
        cy.contains("button", "Reactivate").click();
      });
      cy.wait("@reactivate").its("response.statusCode").should("eq", 200);
      cy.contains("tr", email).within(() => {
        cy.contains("td", "Active").should("exist");
      });

      // Sign-in now succeeds again.
      cy.clearCookie("better-auth.session_token");
      cy.visit("/");
      cy.placeholder("Email").type(email);
      cy.placeholder("Password").type(password);
      cy.contains("button", "Log In").click();
      cy.contains("button", "Log Out").should("exist");
    });
  });
});

// ---------------------------------------------------------------------------
// US3 — Change a user's role
// ---------------------------------------------------------------------------
describe("US3 — Change a user's role", () => {
  beforeEach(cy.login);

  // Runs first in this describe block (before the promote/demote round trip
  // below temporarily adds a second admin) so the seeded admin is still the
  // sole active admin, and the last-admin Demote guard is reachable.
  it("disables Demote on the operator's own row when they are the only active admin (last-admin guard, scenario 3)", () => {
    cy.visit("/admin/users");
    cy.contains("tr", Cypress.env("adminEmail")).within(() => {
      cy.contains("button", "Demote").should("be.disabled");
    });
    cy.contains("Cannot demote the last administrator").should("exist");
  });

  it("promotes a Standard user (no confirm) and demotes them back to Standard behind a two-step confirm (scenarios 1, 2, 4)", () => {
    createAccount("us3-role", "standard").then(({ email }) => {
      cy.visit("/admin/users");

      cy.intercept("POST", /\/api\/admin\/users\/.+\/role/).as("promote");
      cy.contains("tr", email).within(() => {
        cy.contains("button", "Promote").click();
      });
      cy.wait("@promote").its("response.statusCode").should("eq", 200);
      cy.contains("tr", email).within(() => {
        cy.contains("td", "Administrator").should("exist");
      });

      cy.intercept("POST", /\/api\/admin\/users\/.+\/role/).as("demote");
      cy.contains("tr", email).within(() => {
        cy.contains("button", "Demote").click();
        cy.contains("button", "Confirm demote").click();
      });
      cy.wait("@demote").its("response.statusCode").should("eq", 200);
      cy.contains("tr", email).within(() => {
        cy.contains("td", "Standard").should("exist");
      });
    });
  });
});

// ---------------------------------------------------------------------------
// US4 — Force sign-out
// ---------------------------------------------------------------------------
describe("US4 — Force sign-out", () => {
  beforeEach(cy.login);

  it("force-sign-out ends a user's active session while the account stays Active, and they can sign back in (scenarios per US4)", () => {
    createAccount("us4-force", "standard").then(({ email, password }) => {
      // Establish a real active session for the target and capture its
      // session token so we can independently verify it dies, without
      // disturbing our own (admin) browser session below.
      cy.request("POST", "/api/auth/sign-in/email", { email, password });
      cy.getCookie("better-auth.session_token").its("value").as("targetToken");

      // Switch back to the admin session to perform the force sign-out.
      cy.login();
      cy.visit("/admin/users");

      cy.intercept("POST", /\/api\/admin\/users\/.+\/revoke-sessions/).as("forceSignOut");
      cy.contains("tr", email).within(() => {
        cy.contains("button", "Force Sign Out").click();
        cy.contains("button", "Confirm force sign-out").click();
      });
      cy.wait("@forceSignOut").its("response.statusCode").should("eq", 200);

      // The account stays Active and the outcome is announced.
      cy.contains("tr", email).within(() => {
        cy.contains("td", "Active").should("exist");
      });
      cy.contains("session(s) ended").should("exist");

      // The target's previously-captured session no longer authenticates.
      cy.get("@targetToken").then((token) => {
        cy.setCookie("better-auth.session_token", token);
        cy.request("/api/auth/get-session").its("body").should("be.null");
      });

      // The account was never deactivated — a fresh sign-in still succeeds.
      cy.request("POST", "/api/auth/sign-in/email", { email, password })
        .its("status")
        .should("eq", 200);
    });
  });
});
