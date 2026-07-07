/**
 * escapeHtml — shared HTML-escaping helper for email message builders.
 *
 * Remediation: dedup of the identical private escapeHtml() previously defined
 * separately in passwordResetEmail.ts and invitationEmail.ts (task
 * lessons-from-luke-5qjl.12). Single source of truth, same convention as
 * getEmailTransport's placeholder literal (lessons-from-luke-5qjl.7) and
 * getWebAppBaseUrl/getInvitationBaseUrl (lessons-from-luke-5qjl.9).
 */

/**
 * Escapes a string for safe embedding in an HTML attribute value or body text.
 * Replaces &, <, >, ", and ' with their HTML entity equivalents.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
