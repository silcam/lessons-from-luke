/**
 * email-transport.contract.ts — Internal contract for the server-only
 * transactional email capability (FR-001..FR-004).
 *
 * This is a DESIGN CONTRACT, not shipped code. It pins the shapes that the
 * implementation under src/server/email/ and its unit tests must honor. The
 * capability is server-only: it MUST NOT be importable from src/core (isomorphic)
 * or the desktop offline path (constitution Principle VI server-only exemption).
 */

/** A fully-rendered, ready-to-send transactional message. Not persisted. */
export interface EmailMessage {
  /** Single RFC-5322 recipient. Required, non-empty, no CR/LF. */
  to: string;
  /** Single-line subject. Required, non-empty, no CR/LF (header-injection safe). */
  subject: string;
  /** Plain-text body; contains the action link verbatim (so dev/test logs expose it). */
  text: string;
  /** Optional HTML body; when present, contains the action link as an anchor. */
  html?: string;
}

/**
 * The capability boundary. One method: send resolves when the message is
 * accepted for delivery and THROWS on any failure. Callers decide whether a
 * failure is surfaced (invitation create/resend → emailSent flag) or swallowed
 * (password reset → generic response, FR-013).
 */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/** Test-only captured record (MemoryEmailTransport). Cleared per-test in jestSetupAfterEnv. */
export interface SentEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Validated Mailgun configuration (subset of Secrets.email). In production,
 * secrets.ts fail-fasts if any required field is missing/empty/placeholder.
 * Field names only are ever logged — never values (FR-004).
 *
 * Cross-field rule (red-team Pass 7): validation MUST also check that the domain
 * part of `fromAddress` equals or is a subdomain of `domain` (DKIM/DMARC
 * alignment), else mail is silently spam-foldered/rejected in production. Fail
 * fast with a field-names-only error.
 */
export interface EmailConfig {
  apiKey: string;
  domain: string;
  /** From-address; its domain MUST align with `domain` (see cross-field rule above). */
  fromAddress: string;
  /** Optional region base; default "https://api.mailgun.net". */
  baseUrl?: string;
}

/**
 * Env-selected singleton accessors (mirror getAuth()/getAuthPool()):
 *   getEmailTransport(): EmailTransport   // production→Mailgun, dev→Log, test→Memory
 *   setEmailTransport(t: EmailTransport): void  // test injection
 *   resetEmailTransport(): void                 // test isolation; clears Memory buffer
 */
export type GetEmailTransport = () => EmailTransport;
