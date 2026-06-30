/**
 * getEmailTransport — env-selected singleton for the email transport.
 *
 * Selection (fail-closed, red-team Pass 2):
 *   - Whenever `secrets.email` is *production-shaped* — present, with non-empty
 *     apiKey/domain/fromAddress that are NOT the built-in placeholder values
 *     `defaultSecrets.email` carries in secrets.ts — ALWAYS return
 *     MailgunEmailTransport, regardless of NODE_ENV. This keeps selection
 *     config-driven (not purely NODE_ENV-driven) and ties it to the same
 *     "is this real config" predicate as the FR-002 startup fail-fast in
 *     secrets.ts, so LogEmailTransport is unreachable when real email config
 *     exists.
 *   - Otherwise (no config, or only the placeholder default — e.g. dev/test
 *     with no secrets.json on disk) fall through to NODE_ENV selection:
 *       - NODE_ENV=test → MemoryEmailTransport
 *       - otherwise (development) → LogEmailTransport
 *
 * Test injection: `setEmailTransport(t)` / `resetEmailTransport()`.
 * `resetEmailTransport()` also clears the MemoryEmailTransport sentEmails buffer.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (selection)
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts §GetEmailTransport
 */

import secrets, { Secrets, defaultSecrets } from "../util/secrets";
import { EmailTransport } from "./EmailTransport";
import { MailgunEmailTransport } from "./MailgunEmailTransport";
import { LogEmailTransport } from "./LogEmailTransport";
import { MemoryEmailTransport, sentEmails } from "./MemoryEmailTransport";

let currentTransport: EmailTransport | null = null;

// Single source of truth (task lessons-from-luke-5qjl.7): the placeholder shape
// `defaultSecrets.email` carries in secrets.ts when no secrets.json is present on
// disk. Imported directly — never re-declared as an independent literal here — so
// the two can never silently desync. Config matching these values is NOT
// production-shaped. (secrets.ts asserts non-null with `!` the same way for its own
// FR-002 production guard, since defaultSecrets.email is always defined there.)
const PLACEHOLDER_EMAIL = defaultSecrets.email!;

/**
 * True only for genuinely valid, non-placeholder email config — i.e. present, with
 * non-empty apiKey/domain/fromAddress that are not the built-in placeholder defaults.
 */
function isProductionShapedEmailConfig(
  email: Secrets["email"]
): email is NonNullable<Secrets["email"]> {
  if (!email) {
    return false;
  }
  return (
    Boolean(email.apiKey) &&
    email.apiKey !== PLACEHOLDER_EMAIL.apiKey &&
    Boolean(email.domain) &&
    email.domain !== PLACEHOLDER_EMAIL.domain &&
    Boolean(email.fromAddress) &&
    email.fromAddress !== PLACEHOLDER_EMAIL.fromAddress
  );
}

function createDefaultTransport(): EmailTransport {
  // Fail-closed (Pass 2): only genuinely valid, non-placeholder email config selects Mailgun.
  if (isProductionShapedEmailConfig(secrets.email)) {
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
