/**
 * invitationEmail — builds the invitation-link email message.
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
 * Escapes a string for safe embedding in an HTML attribute value or body text.
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
 * Builds an invitation-link email message.
 *
 * The `to` and `link`/`email` values are used as supplied; single-recipient and
 * header-injection validation is enforced by `EmailTransport.send()` (Pass 10), not
 * here. The HTML body HTML-attribute-encodes the link's href and HTML-escapes the
 * invitee email address shown in the body text (Pass 1).
 *
 * @param invitation - The invitee's email and the already-constructed invitation link.
 * @param locale - Locale for message content (explicit seam, red-team Pass 2).
 * @returns A ready-to-send EmailMessage.
 */
export function buildInvitationEmail(
  invitation: InvitationEmailInput,
  locale?: string,
): EmailMessage {
  void locale; // Locale seam — content is currently hardcoded English.

  const { email, link } = invitation;

  const text = [
    "You've been invited to join Lessons from Luke.",
    "",
    "Click or copy the link below to create your account:",
    "",
    link,
    "",
    "This invitation link is single-use.",
    "",
    "If you weren't expecting this invitation, you can ignore this email.",
  ].join("\n");

  // HTML body: link is embedded in a safe href attribute; the invitee email is
  // HTML-escaped before being shown in body text (Pass 1 HTML-body safety).
  const html = [
    "<p>You&rsquo;ve been invited to join Lessons from Luke.</p>",
    `<p><a href="${escapeHtml(link)}">Create your account</a></p>`,
    `<p>This invitation was sent to ${escapeHtml(email)}.</p>`,
    "<p>This invitation link is single-use.</p>",
    "<p>If you weren&rsquo;t expecting this invitation, you can ignore this email.</p>",
  ].join("");

  return {
    to: email,
    subject: "You're invited to Lessons from Luke",
    text,
    html,
  };
}
