/**
 * passwordChangedEmail unit tests — RED (task lessons-from-luke-5qjl.5.3.1)
 *
 * These tests are INTENTIONALLY FAILING at commit time. The stub implementation
 * returns empty/wrong values. They drive the GREEN task
 * (lessons-from-luke-5qjl.5.3.2).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Research: research.md §D7 — out-of-band "password was changed" notice
 * Security: plan.md §Security (Pass 4 best-effort / self-caught, Pass 10 single-recipient)
 */

import { buildPasswordChangedEmail } from "./passwordChangedEmail";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const TEST_EMAIL = "user@example.com";
const TEST_LOCALE = "en";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildPasswordChangedEmail", () => {
  // -------------------------------------------------------------------------
  // 1. Basic structure — to, subject, text with no link
  // -------------------------------------------------------------------------

  it("returns EmailMessage with to=user email, non-empty subject, and text body containing NO reset link or token", () => {
    const token = "some-token-that-must-not-appear";
    const msg = buildPasswordChangedEmail(TEST_EMAIL, TEST_LOCALE);

    expect(msg.to).toBe(TEST_EMAIL);
    expect(msg.subject).toBeTruthy();

    // The "password changed" notice must NOT contain the reset link or token.
    // This is the D7 security requirement: the alert body gives no usable credential.
    expect(msg.text).not.toContain("/reset-password");
    expect(msg.text).not.toContain(token);
  });

  // -------------------------------------------------------------------------
  // 2. "Contact an administrator" notice (D7)
  // -------------------------------------------------------------------------

  it("text body contains a 'contact an administrator' notice", () => {
    const msg = buildPasswordChangedEmail(TEST_EMAIL, TEST_LOCALE);

    // D7: out-of-band alert to the real account owner. If this wasn't you,
    // the user must be told to contact an administrator.
    expect(msg.to).toBe(TEST_EMAIL);
    expect(msg.text.toLowerCase()).toContain("administrator");
  });

  // -------------------------------------------------------------------------
  // 3. Header-injection safety + single-recipient guard
  // -------------------------------------------------------------------------

  it("subject contains no CR/LF; to contains no CR/LF, comma, or semicolon", () => {
    const msg = buildPasswordChangedEmail(TEST_EMAIL, TEST_LOCALE);

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
  // 4. Locale seam (Pass 2) — signature must accept locale
  // -------------------------------------------------------------------------

  it("accepts a locale parameter and returns a valid message for any locale", () => {
    // The seam must exist even if content is currently hardcoded English.
    // Both calls must produce a correctly populated message.
    const msgEn = buildPasswordChangedEmail(TEST_EMAIL, "en");
    const msgFr = buildPasswordChangedEmail(TEST_EMAIL, "fr");

    expect(msgEn.to).toBe(TEST_EMAIL);
    expect(msgFr.to).toBe(TEST_EMAIL);
    expect(msgEn.subject).toBeTruthy();
    expect(msgFr.subject).toBeTruthy();
  });
});
