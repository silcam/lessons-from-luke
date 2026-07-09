/**
 * EmailTransport — server-only capability boundary for transactional email.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts
 */

/** A fully-rendered, ready-to-send transactional message. Not persisted. */
export interface EmailMessage {
  /**
   * Single RFC-5322 recipient. Required, non-empty.
   * MUST be exactly one address — reject list separators (`,`/`;`) at the
   * transport boundary (red-team Pass 10).
   */
  to: string;
  /** Single-line subject. Required, non-empty, no CR/LF (header-injection safe). */
  subject: string;
  /** Plain-text body; contains the action link verbatim. */
  text: string;
  /** Optional HTML body; when present, contains the action link as an anchor. */
  html?: string;
}

/**
 * The capability boundary. One method: send resolves when the message is
 * accepted for delivery and THROWS on any failure.
 */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Single-recipient guard (red-team Pass 10). EmailMessage.to documents an
 * interface-level invariant — exactly one address, no list separators — and
 * that invariant is only real if every EmailTransport implementation enforces
 * it identically. EVERY implementation of EmailTransport.send() MUST call
 * this first, before any other side effect (network call, log write, buffer
 * append), so callers can rely on the same rejection behavior regardless of
 * which transport `getEmailTransport()` selects for the current environment.
 *
 * See the shared/parameterized contract test:
 * EmailTransport.singleRecipientGuard.test.ts.
 */
export function assertSingleRecipient(to: string): void {
  if (to.includes(",") || to.includes(";")) {
    throw new Error(
      "EmailMessage.to must be a single recipient address. " +
        "List separators (comma, semicolon) are not allowed."
    );
  }
}

/** Test-only captured record (MemoryEmailTransport). Cleared per-test in jestSetupAfterEnv. */
export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
