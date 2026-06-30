/**
 * MemoryEmailTransport — test email transport. Appends sent messages to the module-level
 * `sentEmails` array for in-process assertions. Also logs to console.log so the action
 * link is visible in test output. Never calls any external service.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (MemoryEmailTransport row)
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts §SentEmail
 *
 * Lifecycle: `sentEmails` is cleared by `resetEmailTransport()` from `getEmailTransport.ts`
 * in `jestSetupAfterEnv.ts`'s `afterEach` (mirrors the existing `DELETE FROM "invitation"` cleanup).
 */

import { EmailTransport, EmailMessage, SentEmail } from "./EmailTransport";

/** In-process buffer of all emails sent during the current test. */
export const sentEmails: SentEmail[] = [];

export class MemoryEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<void> {
    const record: SentEmail = {
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    };
    sentEmails.push(record);
    console.log("MemoryEmailTransport: [EMAIL CAPTURED — test mode]", {
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });
  }
}
