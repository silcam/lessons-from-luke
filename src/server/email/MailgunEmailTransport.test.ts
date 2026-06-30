/**
 * MailgunEmailTransport unit tests — RED (task lessons-from-luke-5qjl.5.2.1)
 *
 * These tests are INTENTIONALLY FAILING at commit time. The production
 * MailgunEmailTransport implementation does not yet exist. They drive the
 * GREEN task (lessons-from-luke-5qjl.5.2.2).
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §MailgunEmailTransport
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts
 * Plan security passes: Pass 1 (URLSearchParams body), Pass 7 (tracking + error redaction),
 *   Pass 10 (single-recipient guard)
 */

import { MailgunEmailTransport } from "./MailgunEmailTransport";
import { EmailMessage } from "./EmailTransport";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const validConfig = {
  apiKey: "unit-test-api-key-not-a-real-credential",
  domain: "mg.example.com",
  fromAddress: "noreply@mg.example.com",
};

const validMessage: EmailMessage = {
  to: "recipient@example.com",
  subject: "Reset your password",
  text: "Click this link to reset: https://app.example.com/reset-password?token=abc123def456ghi789",
  html: '<p>Click <a href="https://app.example.com/reset-password?token=abc123def456ghi789">here</a> to reset.</p>',
};

// ---------------------------------------------------------------------------
// Setup: capture and restore global fetch
// ---------------------------------------------------------------------------

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MailgunEmailTransport", () => {
  // -------------------------------------------------------------------------
  // 1. send() POSTs to the correct Mailgun URL with Basic auth header
  // -------------------------------------------------------------------------

  it("send() POSTs to the correct Mailgun URL with a Basic auth header", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "<test@mg.example.com>", message: "Queued" }),
    } as unknown as Response);
    globalThis.fetch = mockFetch;

    const transport = new MailgunEmailTransport(validConfig);
    await transport.send(validMessage);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];

    // URL must be the Mailgun v3 messages endpoint for the configured domain
    expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");

    // Auth header: Basic base64("api:<apiKey>")
    const expectedAuth =
      "Basic " + Buffer.from(`api:${validConfig.apiKey}`).toString("base64");
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(expectedAuth);
  });

  it("send() uses the configured baseUrl when provided", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "<test@mg.eu>", message: "Queued" }),
    } as unknown as Response);
    globalThis.fetch = mockFetch;

    const transport = new MailgunEmailTransport({
      ...validConfig,
      domain: "mg.eu.example.com",
      baseUrl: "https://api.eu.mailgun.net",
    });
    await transport.send(validMessage);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.eu.mailgun.net/v3/mg.eu.example.com/messages");
  });

  // -------------------------------------------------------------------------
  // 2. Body is built with URLSearchParams (tracking flags present)
  // -------------------------------------------------------------------------

  it("body is application/x-www-form-urlencoded with o:tracking=no, o:tracking-clicks=no, o:tracking-opens=no", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "<test@mg.example.com>", message: "Queued" }),
    } as unknown as Response);
    globalThis.fetch = mockFetch;

    const transport = new MailgunEmailTransport(validConfig);
    await transport.send(validMessage);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];

    // Body must be a URLSearchParams instance (or its string serialization)
    const body = options.body;
    expect(body).toBeTruthy();

    // Parse the body to check individual fields
    const params = new URLSearchParams(body as string);
    expect(params.get("o:tracking")).toBe("no");
    expect(params.get("o:tracking-clicks")).toBe("no");
    expect(params.get("o:tracking-opens")).toBe("no");

    // Core message fields must also be present
    expect(params.get("from")).toBe(validConfig.fromAddress);
    expect(params.get("to")).toBe(validMessage.to);
    expect(params.get("subject")).toBe(validMessage.subject);
    expect(params.get("text")).toBe(validMessage.text);
  });

  it("body built with URLSearchParams — special chars in field values are encoded, not injected", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "<t@mg.example.com>", message: "Queued" }),
    } as unknown as Response);
    globalThis.fetch = mockFetch;

    // A subject containing &, = characters that would inject params if hand-concatenated
    const maliciousMessage: EmailMessage = {
      to: "victim@example.com",
      subject: "Reset&bcc=attacker@evil.com&o:tag=leaked",
      text: "Click: https://app.example.com/reset?token=TOKEN",
    };

    const transport = new MailgunEmailTransport(validConfig);
    await transport.send(maliciousMessage);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const params = new URLSearchParams(options.body as string);

    // The subject must come through as-is (encoded, not split into extra params)
    expect(params.get("subject")).toBe(maliciousMessage.subject);
    // bcc must NOT be present as a separate injected parameter
    expect(params.get("bcc")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. Single-recipient guard: comma in `to` is rejected (never sent)
  // -------------------------------------------------------------------------

  it("rejects a `to` value containing a comma and never calls fetch (Pass 10 single-recipient guard)", async () => {
    const mockFetch = jest.fn();
    globalThis.fetch = mockFetch;

    const transport = new MailgunEmailTransport(validConfig);

    await expect(
      transport.send({
        ...validMessage,
        to: "alice@example.com,bob@example.com",
      })
    ).rejects.toThrow();

    // fetch must NOT have been called — the guard must fire before the network call
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects a `to` value containing a semicolon and never calls fetch (Pass 10 single-recipient guard)", async () => {
    const mockFetch = jest.fn();
    globalThis.fetch = mockFetch;

    const transport = new MailgunEmailTransport(validConfig);

    await expect(
      transport.send({
        ...validMessage,
        to: "alice@example.com;bob@example.com",
      })
    ).rejects.toThrow();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. AbortSignal.timeout is applied
  // -------------------------------------------------------------------------

  it("AbortSignal.timeout is applied — send throws when fetch never resolves (simulated via fake timers)", async () => {
    jest.useFakeTimers();

    // Stub fetch to never resolve (simulating a hung network connection)
    globalThis.fetch = jest.fn(
      () => new Promise<Response>(() => {})
    ) as unknown as typeof fetch;

    const transport = new MailgunEmailTransport(validConfig);
    const sendPromise = transport.send(validMessage);

    // Advance time past the 10-second AbortSignal.timeout
    await jest.advanceTimersByTimeAsync(11_000);

    // The send must have thrown (AbortError or similar timeout error)
    await expect(sendPromise).rejects.toThrow();

    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 5. Non-2xx response throws error with HTTP status + Mailgun message only
  // -------------------------------------------------------------------------

  it("throws on a non-2xx Mailgun response: error message contains HTTP status and Mailgun message field", async () => {
    const mailgunMessage = "Domain not found";
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: mailgunMessage }),
    } as unknown as Response);

    const transport = new MailgunEmailTransport(validConfig);

    await expect(transport.send(validMessage)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("404"),
      })
    );
  });

  it("thrown error message for a non-2xx response includes the Mailgun message field", async () => {
    const mailgunMessage = "Sandbox subdomains are for test purposes only";
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: mailgunMessage }),
    } as unknown as Response);

    const transport = new MailgunEmailTransport(validConfig);

    await expect(transport.send(validMessage)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(mailgunMessage),
      })
    );
  });

  it("thrown error message does NOT contain the submitted text body (token redaction)", async () => {
    const resetToken = "abc123def456ghi789";
    const messageWithToken: EmailMessage = {
      to: "user@example.com",
      subject: "Reset your password",
      text: `Click: https://app.example.com/reset?token=${resetToken}`,
    };

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({
          message: "Internal Server Error",
        }),
    } as unknown as Response);

    const transport = new MailgunEmailTransport(validConfig);

    let thrownError: Error | undefined;
    try {
      await transport.send(messageWithToken);
    } catch (e) {
      thrownError = e as Error;
    }

    expect(thrownError).toBeDefined();
    // The thrown error must NOT expose the reset token or the text body
    expect(thrownError!.message).not.toContain(resetToken);
    expect(thrownError!.message).not.toContain(messageWithToken.text);
  });

  // -------------------------------------------------------------------------
  // 6. Mailgun error response echoing submitted text: log and throw with no link/token
  //    (Pass 7 redaction — error built from bounded, structured view only)
  // -------------------------------------------------------------------------

  it("a Mailgun error response that echoes the submitted text body produces a thrown error containing no link/token (Pass 7)", async () => {
    const resetToken = "secret-reset-token-abc123";
    const resetLink = `https://app.example.com/reset-password?token=${resetToken}`;
    const messageWithLink: EmailMessage = {
      to: "user@example.com",
      subject: "Password Reset",
      text: `Click to reset: ${resetLink}`,
    };

    // Mailgun echoes the submitted text in its error response body
    const echoedText = messageWithLink.text;
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          message: "Bad Request",
          // Mailgun echoes the submitted text in the error (real-world behaviour)
          text: echoedText,
        }),
    } as unknown as Response);

    const transport = new MailgunEmailTransport(validConfig);

    let thrownError: Error | undefined;
    try {
      await transport.send(messageWithLink);
    } catch (e) {
      thrownError = e as Error;
    }

    expect(thrownError).toBeDefined();
    // The thrown error must be constructed from the bounded message field only —
    // NOT from the raw response body or any echoed request field.
    expect(thrownError!.message).not.toContain(resetToken);
    expect(thrownError!.message).not.toContain(resetLink);
    expect(thrownError!.message).not.toContain(echoedText);
  });
});
