/**
 * LogEmailTransport — development email transport. Writes to+subject+text(+html) to
 * console.log so the action link is visible in dev output. Never calls any external
 * service.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (LogEmailTransport row)
 */

import { EmailTransport, EmailMessage, assertSingleRecipient } from "./EmailTransport";

export class LogEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<void> {
    // Single-recipient guard (red-team Pass 10): enforced identically across every
    // EmailTransport implementation — see EmailTransport.ts.
    assertSingleRecipient(message.to);

    console.log("LogEmailTransport: [EMAIL NOT SENT — dev mode]", {
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });
  }
}
