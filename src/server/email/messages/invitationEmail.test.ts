/**
 * invitationEmail unit tests.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Plan: plan.md §Project Structure (messages/invitationEmail.ts)
 * Research: research.md §D6 — invitation auto-delivery & resend
 * Security: plan.md §Security (Pass 1 HTML safety, Pass 2 locale seam,
 *           Pass 10 single-recipient guard)
 */

import { buildInvitationEmail } from "./invitationEmail";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const TEST_EMAIL = "invitee@example.com";
const TEST_LINK = "https://example.com/invitation/abc123xyz";
const TEST_LOCALE = "en";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildInvitationEmail", () => {
  // -------------------------------------------------------------------------
  // 1. Basic structure — to, subject, text with link
  // -------------------------------------------------------------------------

  it("returns EmailMessage with to=invitation.email, non-empty subject, text containing the invitation link verbatim", () => {
    const msg = buildInvitationEmail(
      { email: TEST_EMAIL, link: TEST_LINK },
      TEST_LOCALE,
    );

    expect(msg.to).toBe(TEST_EMAIL);
    expect(msg.subject).toBeTruthy();
    expect(msg.text).toContain(TEST_LINK);
  });

  // -------------------------------------------------------------------------
  // 2. HTML body safety — href attribute encoding, invitee email escaped
  // -------------------------------------------------------------------------

  it("when html is present, the link appears as an href and the invitee email is HTML-escaped in the body", () => {
    const msg = buildInvitationEmail(
      { email: TEST_EMAIL, link: TEST_LINK },
      TEST_LOCALE,
    );

    // Verify basic correctness first (will fail with stub — ensures the test is RED)
    expect(msg.to).toBe(TEST_EMAIL);

    if (msg.html !== undefined) {
      // The href must contain the exact link.
      expect(msg.html).toContain(`href="${TEST_LINK}"`);

      // link in text and html must match exactly
      expect(msg.text).toContain(TEST_LINK);

      // The invitee address must be displayed somewhere in the body, escaped.
      expect(msg.html).toContain(TEST_EMAIL);
    }

    // Ensure that calling with an invitee email containing HTML-special chars does
    // not produce unescaped markup in html (phishing / markup-injection surface).
    const xssEmail = 'invitee+"<script>@example.com';
    const xssMsg = buildInvitationEmail(
      { email: xssEmail, link: TEST_LINK },
      TEST_LOCALE,
    );
    if (xssMsg.html !== undefined) {
      expect(xssMsg.html).not.toContain("<script>");
      expect(xssMsg.html).not.toContain(`"${xssEmail}"`);
    }

    // A link containing HTML-special characters must not break attribute encoding either.
    const xssLink = "https://example.com/invitation/abc\"><script>alert(1)</script>";
    const xssLinkMsg = buildInvitationEmail(
      { email: TEST_EMAIL, link: xssLink },
      TEST_LOCALE,
    );
    if (xssLinkMsg.html !== undefined) {
      expect(xssLinkMsg.html).not.toContain("<script>alert(1)</script>");
    }
  });

  // -------------------------------------------------------------------------
  // 3. Header-injection safety + single-recipient guard
  // -------------------------------------------------------------------------

  it("subject contains no CR/LF; to contains no CR/LF, comma, or semicolon", () => {
    const msg = buildInvitationEmail(
      { email: TEST_EMAIL, link: TEST_LINK },
      TEST_LOCALE,
    );

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
  // 4. Locale seam (Pass 2) — signature must accept an optional locale
  // -------------------------------------------------------------------------

  it("accepts an optional locale parameter and returns a valid message for any locale, including when omitted", () => {
    // The seam must exist even if content is currently hardcoded English.
    // All calls must produce a correctly populated message.
    const msgEn = buildInvitationEmail({ email: TEST_EMAIL, link: TEST_LINK }, "en");
    const msgFr = buildInvitationEmail({ email: TEST_EMAIL, link: TEST_LINK }, "fr");
    const msgDefault = buildInvitationEmail({ email: TEST_EMAIL, link: TEST_LINK });

    expect(msgEn.to).toBe(TEST_EMAIL);
    expect(msgFr.to).toBe(TEST_EMAIL);
    expect(msgDefault.to).toBe(TEST_EMAIL);
    expect(msgEn.subject).toBeTruthy();
    expect(msgFr.subject).toBeTruthy();
    expect(msgDefault.subject).toBeTruthy();
  });
});
