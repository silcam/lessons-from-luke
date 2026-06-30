/**
 * MailgunEmailTransport — production email transport using the Mailgun REST API.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §MailgunEmailTransport
 * Plan security: Pass 1 (URLSearchParams body), Pass 7 (tracking + error redaction),
 *   Pass 10 (single-recipient guard)
 */

import { EmailTransport, EmailMessage } from "./EmailTransport";

export interface MailgunConfig {
  apiKey: string;
  domain: string;
  fromAddress: string;
  /** Optional region base URL; default "https://api.mailgun.net". */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.mailgun.net";
const TIMEOUT_MS = 10_000;

export class MailgunEmailTransport implements EmailTransport {
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly fromAddress: string;
  private readonly baseUrl: string;

  constructor(config: MailgunConfig) {
    this.apiKey = config.apiKey;
    this.domain = config.domain;
    this.fromAddress = config.fromAddress;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Send a transactional email via Mailgun.
   *
   * Implementation note: `send()` is NOT declared `async` — it explicitly pre-attaches a
   * noop `.catch(() => {})` to the returned promise before returning, so the promise is
   * always "handled" from Node.js's perspective the instant the caller receives it. This
   * prevents "unhandledRejection" in test patterns that call:
   *
   *   const p = transport.send(msg);
   *   await someAsyncWork();           // <-- rejection may fire here
   *   await expect(p).rejects.toThrow(); // <-- handler attached here (too late otherwise)
   */
  send(message: EmailMessage): Promise<void> {
    const promise = this._sendCore(message);
    // Pre-attach a noop handler so Node.js never treats this promise as "unhandled",
    // even if the rejection fires before the caller can attach its own handler.
    // Multiple handlers on the same promise are fine: the test's handler also fires.
    promise.catch(() => {});
    return promise;
  }

  private async _sendCore(message: EmailMessage): Promise<void> {
    // Single-recipient guard (red-team Pass 10): reject list separators before the
    // network call. Mailgun splits `to` on commas, and URLSearchParams encoding does
    // not neutralize a comma inside a field value.
    if (message.to.includes(",") || message.to.includes(";")) {
      throw new Error(
        "EmailMessage.to must be a single recipient address. " +
          "List separators (comma, semicolon) are not allowed."
      );
    }

    const url = `${this.baseUrl}/v3/${this.domain}/messages`;
    const authHeader = "Basic " + Buffer.from(`api:${this.apiKey}`).toString("base64");

    // Build body with URLSearchParams to prevent form-parameter injection (Pass 1):
    // a field value containing `&`/`=` cannot inject extra Mailgun parameters.
    const params = new URLSearchParams();
    params.set("from", this.fromAddress);
    params.set("to", message.to);
    params.set("subject", message.subject);
    params.set("text", message.text);
    if (message.html !== undefined) {
      params.set("html", message.html);
    }
    // Disable Mailgun tracking per-message (red-team Pass 7): prevents Mailgun from
    // rewriting the action link through its redirector and storing the single-use
    // reset token in its click-analytics (a live credential outside our trust boundary).
    params.set("o:tracking", "no");
    params.set("o:tracking-clicks", "no");
    params.set("o:tracking-opens", "no");

    // Timeout via Promise.race with a setTimeout-based timeout promise.
    // AbortSignal.timeout(TIMEOUT_MS) is applied as belt-and-suspenders to cancel
    // the underlying connection in production; the setTimeout race is needed for
    // testability because jest fake timers mock setTimeout but the mock fetch in
    // tests does not respond to AbortSignal abort events.
    let timerHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerHandle = setTimeout(() => {
        reject(new Error(`Mailgun request timed out after ${TIMEOUT_MS / 1000} seconds`));
      }, TIMEOUT_MS);
    });
    // Suppress secondary unhandledRejection for timeoutPromise when the fetch completes
    // first (after Promise.race settles, any later rejection of timeoutPromise would
    // otherwise be unhandled).
    timeoutPromise.catch(() => {});

    let response: Response;
    try {
      response = await Promise.race([
        fetch(url, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
        timeoutPromise,
      ]);
      if (timerHandle !== null) {
        clearTimeout(timerHandle);
        timerHandle = null;
      }
    } catch (err) {
      if (timerHandle !== null) {
        clearTimeout(timerHandle);
      }
      // Log to+subject+error only — NEVER the text/html body or action link (Pass 1/7).
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("MailgunEmailTransport send error", {
        to: message.to,
        subject: message.subject,
        error: errMsg,
      });
      throw err;
    }

    if (!response.ok) {
      // Build error from a bounded, structured view: HTTP status + Mailgun `.message`
      // field ONLY. Never use the raw response body or any echoed request field —
      // Mailgun can echo the submitted text (which contains the reset token) in its
      // error response, so logging or throwing the raw body would leak the token
      // through the value we declared "safe to log" (red-team Pass 7).
      let mailgunMessage = "";
      try {
        const body = (await response.json()) as { message?: string };
        mailgunMessage = body.message ?? "";
      } catch {
        // Ignore parse errors — we never use the raw body anyway.
      }

      const errorMessage = `Mailgun send failed: HTTP ${response.status} — ${mailgunMessage}`;
      // Log to+subject+error only (never text/html body) (Pass 1/7).
      console.error("MailgunEmailTransport send error", {
        to: message.to,
        subject: message.subject,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }
  }
}
