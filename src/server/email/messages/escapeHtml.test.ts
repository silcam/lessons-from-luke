/**
 * escapeHtml unit tests.
 *
 * Remediation: dedup of the identical private escapeHtml() helper that was
 * previously defined separately in passwordResetEmail.ts and
 * invitationEmail.ts (task lessons-from-luke-5qjl.12). Single source of
 * truth, same convention as getEmailTransport's placeholder literal
 * (lessons-from-luke-5qjl.7) and getWebAppBaseUrl/getInvitationBaseUrl
 * (lessons-from-luke-5qjl.9).
 */

import { escapeHtml } from "./escapeHtml";

describe("escapeHtml", () => {
  it("escapes &, <, >, \", and ' to their HTML entity equivalents", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes & first so entities produced by other replacements are not re-escaped", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("leaves a string with no HTML-special characters unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });

  it("returns an empty string for an empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
