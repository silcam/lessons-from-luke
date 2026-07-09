/**
 * EmailTransport.singleRecipientGuard.test.ts — shared/parameterized contract test
 * (architecture-review remediation, task lessons-from-luke-5qjl.8).
 *
 * EmailTransport.ts documents an interface-level invariant: EmailMessage.to MUST be
 * exactly one address — list separators (`,`/`;`) must be rejected "at the transport
 * boundary" (red-team Pass 10). That invariant is only meaningful if EVERY
 * implementation of EmailTransport enforces it identically, since callers and tests
 * run against whichever transport `getEmailTransport()` selects for the current env
 * (Mailgun in production, Log in dev, Memory in test). This file parameterizes the
 * same guard assertions over all three implementations so a regression in any one of
 * them fails this suite.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts
 */

import { EmailTransport, EmailMessage } from "./EmailTransport";
import { MailgunEmailTransport } from "./MailgunEmailTransport";
import { MemoryEmailTransport, sentEmails } from "./MemoryEmailTransport";
import { LogEmailTransport } from "./LogEmailTransport";
import { resetEmailTransport } from "./getEmailTransport";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const validMailgunConfig = {
  apiKey: "unit-test-api-key-not-a-real-credential",
  domain: "mg.example.com",
  fromAddress: "noreply@mg.example.com",
};

const baseMessage: Omit<EmailMessage, "to"> = {
  subject: "Reset your password",
  text: "Click this link to reset: https://app.example.com/reset-password?token=abc123def456",
};

// ---------------------------------------------------------------------------
// Setup: capture/restore global fetch (MailgunEmailTransport's network call must
// never fire when the guard rejects), and reset the Memory buffer between tests.
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;
let mockFetch: jest.Mock;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ id: "<test@mg.example.com>", message: "Queued" }),
  } as unknown as Response);
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetEmailTransport();
});

// ---------------------------------------------------------------------------
// Parameterized cases: same assertions against all three EmailTransport implementations
// ---------------------------------------------------------------------------

const transports: ReadonlyArray<{ name: string; create: () => EmailTransport }> = [
  {
    name: "MailgunEmailTransport",
    create: () => new MailgunEmailTransport(validMailgunConfig),
  },
  { name: "MemoryEmailTransport", create: () => new MemoryEmailTransport() },
  { name: "LogEmailTransport", create: () => new LogEmailTransport() },
];

describe.each(transports)("$name single-recipient guard", ({ create }) => {
  it("rejects a `to` value containing a comma and never accepts it for delivery", async () => {
    const transport = create();

    await expect(
      transport.send({ ...baseMessage, to: "alice@example.com,bob@example.com" })
    ).rejects.toThrow();

    // The guard must fire before any side effect: no network call, no captured record.
    expect(mockFetch).not.toHaveBeenCalled();
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects a `to` value containing a semicolon and never accepts it for delivery", async () => {
    const transport = create();

    await expect(
      transport.send({ ...baseMessage, to: "alice@example.com;bob@example.com" })
    ).rejects.toThrow();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(sentEmails).toHaveLength(0);
  });

  it("accepts a legitimate single-recipient `to` value (no regression)", async () => {
    const transport = create();

    await expect(
      transport.send({ ...baseMessage, to: "single-recipient@example.com" })
    ).resolves.not.toThrow();
  });
});
