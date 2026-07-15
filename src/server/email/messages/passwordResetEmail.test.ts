/**
 * passwordResetEmail unit tests.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Plan: plan.md §Project Structure (messages/)
 * Research: research.md §D5 (link construction), §D7 (onPasswordReset)
 * Security: plan.md §Security (Pass 1 HTML safety, Pass 2 trust boundary + locale seam,
 *           Pass 10 single-recipient guard)
 */

// Mock trustedOrigins so link construction is testable without BETTER_AUTH_URL.
// The GREEN implementation MUST call getWebAppBaseUrl() (not the better-auth url arg)
// to build the reset link — this mock is what makes that verifiable.
jest.mock("../../auth/trustedOrigins", () => ({
  ...jest.requireActual<typeof import("../../auth/trustedOrigins")>("../../auth/trustedOrigins"),
  getWebAppBaseUrl: jest.fn(() => "https://example.com"),
}));

import { buildPasswordResetEmail } from "./passwordResetEmail";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const TEST_EMAIL = "user@example.com";
const TEST_TOKEN = "abc123xyz";
const TEST_LOCALE = "en";
const EXPECTED_BASE_URL = "https://example.com";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildPasswordResetEmail", () => {
  // -------------------------------------------------------------------------
  // 1. Basic structure — to, subject, text with link
  // -------------------------------------------------------------------------

  it("returns EmailMessage with to=user email, non-empty subject, text containing the reset link verbatim", () => {
    const msg = buildPasswordResetEmail(TEST_EMAIL, TEST_TOKEN, TEST_LOCALE);

    const expectedLink = `${EXPECTED_BASE_URL}/reset-password?token=${encodeURIComponent(TEST_TOKEN)}`;

    expect(msg.to).toBe(TEST_EMAIL);
    expect(msg.subject).toBeTruthy();
    expect(msg.text).toContain(expectedLink);
  });

  // -------------------------------------------------------------------------
  // 2. Link construction — uses getWebAppBaseUrl(), NOT the better-auth url arg
  // -------------------------------------------------------------------------

  it("builds the reset link as ${baseUrl}/reset-password?token=${encodeURIComponent(token)} using getWebAppBaseUrl()", () => {
    // Special characters in the token must be percent-encoded in the query string
    const specialToken = "tok+with/special=chars&more";
    const msg = buildPasswordResetEmail(TEST_EMAIL, specialToken, TEST_LOCALE);

    const expectedLink = `${EXPECTED_BASE_URL}/reset-password?token=${encodeURIComponent(specialToken)}`;

    expect(msg.text).toContain(expectedLink);
    // The raw (unencoded) special chars must not appear in the link
    expect(msg.text).not.toContain("tok+with/special=chars&more");
  });

  // -------------------------------------------------------------------------
  // 3. HTML body safety — href attribute encoding, no unescaped user values
  // -------------------------------------------------------------------------

  it("when html is present, the link appears as an href and no user-derived value is unescaped", () => {
    const msg = buildPasswordResetEmail(TEST_EMAIL, TEST_TOKEN, TEST_LOCALE);

    // Verify basic correctness first (will fail with stub — ensures the test is RED)
    expect(msg.to).toBe(TEST_EMAIL);

    if (msg.html !== undefined) {
      const expectedLink = `${EXPECTED_BASE_URL}/reset-password?token=${encodeURIComponent(TEST_TOKEN)}`;

      // The href must contain the exact encoded link (no Mailgun rewrite, no truncation)
      expect(msg.html).toContain(`href="${expectedLink}"`);

      // link in text and html must match exactly (same encoded URL)
      expect(msg.text).toContain(expectedLink);
    }

    // Ensure that calling with an email containing HTML-special chars does not
    // produce unescaped markup in html (phishing / markup-injection surface).
    const xssEmail = 'user+"<script>@example.com';
    const xssMsg = buildPasswordResetEmail(xssEmail, TEST_TOKEN, TEST_LOCALE);
    if (xssMsg.html !== undefined) {
      expect(xssMsg.html).not.toContain("<script>");
      // The raw quote character must be escaped in attribute context
      expect(xssMsg.html).not.toContain(`to="${xssEmail}"`);
    }
  });

  // -------------------------------------------------------------------------
  // 4. Header-injection safety + single-recipient guard
  // -------------------------------------------------------------------------

  it("subject contains no CR/LF; to contains no CR/LF, comma, or semicolon", () => {
    const msg = buildPasswordResetEmail(TEST_EMAIL, TEST_TOKEN, TEST_LOCALE);

    // Correctness: values must be non-empty and properly populated
    expect(msg.to).toBe(TEST_EMAIL);
    expect(msg.subject.length).toBeGreaterThan(0);

    // Safety: no SMTP header-injection characters
    expect(msg.subject).not.toMatch(/[\r\n]/);
    expect(msg.to).not.toMatch(/[\r\n]/);

    // Single-recipient guard (Pass 10): no Mailgun list-separator in `to`
    expect(msg.to).not.toContain(",");
    expect(msg.to).not.toContain(";");
  });

  // -------------------------------------------------------------------------
  // 5. Locale seam (Pass 2) — signature must accept locale
  // -------------------------------------------------------------------------

  it("accepts a locale parameter and returns a valid message for any locale", () => {
    // The seam must exist even if content is currently hardcoded English.
    // Both calls must produce a correctly populated message.
    const msgEn = buildPasswordResetEmail(TEST_EMAIL, TEST_TOKEN, "en");
    const msgFr = buildPasswordResetEmail(TEST_EMAIL, TEST_TOKEN, "fr");

    expect(msgEn.to).toBe(TEST_EMAIL);
    expect(msgFr.to).toBe(TEST_EMAIL);
    expect(msgEn.subject).toBeTruthy();
    expect(msgFr.subject).toBeTruthy();
  });
});
