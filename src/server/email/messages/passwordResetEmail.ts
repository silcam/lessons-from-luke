/**
 * passwordResetEmail — builds the password-reset email message.
 *
 * Stub implementation — RED task (lessons-from-luke-5qjl.5.3.1).
 * The full implementation ships in the GREEN task (lessons-from-luke-5qjl.5.3.2).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Plan: plan.md §Project Structure (messages/)
 * Security: plan.md §Security (Pass 1 HTML-body safety, Pass 2 locale seam,
 *           Pass 2 trust boundary — link built from getWebAppBaseUrl(), not url arg)
 */

import type { EmailMessage } from "../EmailTransport";

/**
 * Builds a password-reset email message.
 *
 * The reset link MUST be constructed as:
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
  // Stub — returns wrong values so the RED tests fail on assertion.
  // Replace with a real implementation in the GREEN task.
  void locale;
  void token;
  void to;
  return { to: "", subject: "", text: "" };
}
