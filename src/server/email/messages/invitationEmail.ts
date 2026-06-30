/**
 * invitationEmail — builds the invitation-link email message.
 *
 * Stub implementation — RED task (lessons-from-luke-5qjl.5.4.1).
 * The full implementation ships in the GREEN task (lessons-from-luke-5qjl.5.4.2).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailMessage
 * Plan: plan.md §Project Structure (messages/invitationEmail.ts)
 * Research: research.md §D6 — invitation auto-delivery & resend
 * Security: plan.md §Security (Pass 1 HTML safety, Pass 2 locale seam,
 *           Pass 10 single-recipient guard)
 */

import type { EmailMessage } from "../EmailTransport";

/** The minimal invitation fields needed to build the email. */
export interface InvitationEmailInput {
  /** The invitee's email address (single address, no list separators). */
  email: string;
  /** The already-constructed invitation link (built by the controller). */
  link: string;
}

/**
 * Builds an invitation-link email message.
 *
 * @param invitation - The invitee's email and the already-constructed invitation link.
 * @param locale - Locale for message content (explicit seam, red-team Pass 2).
 * @returns A ready-to-send EmailMessage.
 */
export function buildInvitationEmail(
  invitation: InvitationEmailInput,
  locale?: string,
): EmailMessage {
  // Stub — returns wrong values so the RED tests fail on assertion.
  // Replace with a real implementation in the GREEN task.
  void locale;
  void invitation;
  return { to: "", subject: "", text: "" };
}
