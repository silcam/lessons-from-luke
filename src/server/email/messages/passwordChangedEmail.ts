/**
 * passwordChangedEmail — builds the "your password was changed" notification email.
 *
 * Stub implementation — RED task (lessons-from-luke-5qjl.5.3.1).
 * The full implementation ships in the GREEN task (lessons-from-luke-5qjl.5.3.2).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Research: research.md §D7 — out-of-band security notice to the real account owner
 * Security: plan.md §Security (Pass 4 — onPasswordReset best-effort, self-caught)
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
  // Stub — returns wrong values so the RED tests fail on assertion.
  // Replace with a real implementation in the GREEN task.
  void locale;
  void to;
  return { to: "", subject: "", text: "" };
}
