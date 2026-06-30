/**
 * getEmailTransport — env-selected singleton for the email transport.
 *
 * Selection (fail-closed, red-team Pass 2):
 *   - Whenever `secrets.email` is present (production-shaped config), ALWAYS return
 *     MailgunEmailTransport — regardless of NODE_ENV. This ties selection to the same
 *     predicate as the FR-002 startup fail-fast in secrets.ts, so LogEmailTransport
 *     is unreachable when real email config exists.
 *   - NODE_ENV=test (no production-shaped config) → MemoryEmailTransport
 *   - otherwise (development, no config) → LogEmailTransport
 *
 * Test injection: `setEmailTransport(t)` / `resetEmailTransport()`.
 * `resetEmailTransport()` also clears the MemoryEmailTransport sentEmails buffer.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (selection)
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts §GetEmailTransport
 */

import secrets from "../util/secrets";
import { EmailTransport } from "./EmailTransport";
import { MailgunEmailTransport } from "./MailgunEmailTransport";
import { LogEmailTransport } from "./LogEmailTransport";
import { MemoryEmailTransport, sentEmails } from "./MemoryEmailTransport";

let currentTransport: EmailTransport | null = null;

function createDefaultTransport(): EmailTransport {
  // Fail-closed (Pass 2): if real email config is present, always use Mailgun.
  if (secrets.email) {
    return new MailgunEmailTransport(secrets.email);
  }
  // No production-shaped config — fall back to NODE_ENV selection.
  if (process.env.NODE_ENV === "test") {
    return new MemoryEmailTransport();
  }
  return new LogEmailTransport();
}

/** Returns the env-selected singleton email transport, creating it on first call. */
export function getEmailTransport(): EmailTransport {
  if (!currentTransport) {
    currentTransport = createDefaultTransport();
  }
  return currentTransport;
}

/** Overrides the singleton with a test double. Call resetEmailTransport() to restore. */
export function setEmailTransport(transport: EmailTransport): void {
  currentTransport = transport;
}

/**
 * Restores the default transport and clears the MemoryEmailTransport sentEmails buffer.
 * Called in jestSetupAfterEnv afterEach to provide per-test isolation.
 */
export function resetEmailTransport(): void {
  currentTransport = null;
  sentEmails.splice(0);
}
