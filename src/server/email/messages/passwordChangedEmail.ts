/**
 * passwordChangedEmail — builds the "your password was changed" notification email.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Research: research.md §D7 — out-of-band security notice to the real account owner
 * Security: plan.md §Security (Pass 4 — onPasswordReset best-effort, self-caught)
 *
 * This message MUST NOT contain the reset link or token (D7 spec).
 * It is a link-free confirmation email per D7.
 */

import type { EmailMessage } from "../EmailTransport";

/**
 * Builds a "your password was changed" notification email.
 *
 * This message is sent via `onPasswordReset` as a best-effort security notice
 * to the real account owner. It MUST NOT contain the reset link or token
 * (D7 spec), and MUST include a "contact an administrator" notice so a victim
 * of account takeover can report the incident out-of-band.
 *
 * @param to - The account owner's email address.
 * @param locale - Locale for message content (explicit seam, red-team Pass 2).
 * @returns A ready-to-send EmailMessage.
 */
export function buildPasswordChangedEmail(to: string, locale: string): EmailMessage {
  void locale; // Locale seam — content is currently hardcoded English.

  const text = [
    "Your password was just changed.",
    "",
    "If this wasn't you, please contact an administrator immediately.",
  ].join("\n");

  return {
    to,
    subject: "Your password was changed",
    text,
  };
}
