/**
 * passwordResetEmail — builds the password-reset email message.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Plan: plan.md §Project Structure (messages/)
 * Security: plan.md §Security (Pass 1 HTML-body safety, Pass 2 locale seam,
 *           Pass 2 trust boundary — link built from getWebAppBaseUrl(), not url arg)
 */

import type { EmailMessage } from "../EmailTransport";
import { getWebAppBaseUrl } from "../../auth/trustedOrigins";

/**
 * Escapes a string for safe embedding in an HTML attribute value.
 * Replaces &, <, >, ", and ' with their HTML entity equivalents.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds a password-reset email message.
 *
 * The reset link is constructed as:
 *   `${getWebAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`
 * Never using the better-auth `url` arg (red-team Pass 2 trust-boundary requirement).
 *
 * @param to - The recipient's email address (single address, no list separators).
 * @param token - The raw password-reset token from better-auth.
 * @param locale - Locale for message content (explicit seam, red-team Pass 2).
 * @returns A ready-to-send EmailMessage.
 */
export function buildPasswordResetEmail(
  to: string,
  token: string,
  locale: string,
): EmailMessage {
  void locale; // Locale seam — content is currently hardcoded English.

  const link = `${getWebAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  const text = [
    "You requested a password reset for your account.",
    "",
    "Click or copy the link below to reset your password:",
    "",
    link,
    "",
    "This link is single-use and expires after one hour.",
    "",
    "If you did not request a password reset, you can ignore this email.",
  ].join("\n");

  // HTML body: link is embedded in a safe href attribute; no user-derived values are
  // unescaped. escapeHtml is applied defensively to the link even though
  // encodeURIComponent already neutralises HTML-special chars in the token
  // (Pass 1 HTML-body safety).
  const html = [
    "<p>You requested a password reset for your account.</p>",
    `<p><a href="${escapeHtml(link)}">Reset your password</a></p>`,
    "<p>This link is single-use and expires after one hour.</p>",
    "<p>If you did not request a password reset, you can ignore this email.</p>",
  ].join("");

  return {
    to,
    subject: "Reset your password",
    text,
    html,
  };
}
