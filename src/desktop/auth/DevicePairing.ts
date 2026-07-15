import Axios, { type AxiosError } from "axios";
import { shell } from "electron";

const CLIENT_ID = "lessons-from-luke-desktop";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of a completed device-pairing flow. */
export type PairingResult =
  | { status: "approved"; token: string }
  | { status: "declined" }
  | { status: "expired" };

/**
 * Returned by `startPairing()`.
 *
 * `userCode` is available immediately (before polling begins) so callers can
 * display it in the UI without blocking on the polling loop.
 * `completion` resolves when the polling loop finishes.
 */
export interface PairingHandle {
  /** The user-facing code to display (e.g. "WDJB-MJHT"). */
  userCode: string;
  /** Resolves to the final PairingResult once polling completes. */
  completion: Promise<PairingResult>;
}

/**
 * Thrown when the server returns HTTP 429 during a pairing flow.
 * The message is user-readable and safe to display directly.
 */
export class PairingRateLimitedError extends Error {
  constructor(message = "Too many requests. Please wait a moment and try again.") {
    super(message);
    this.name = "PairingRateLimitedError";
  }
}

// ---------------------------------------------------------------------------
// Internal types (HTTP response shapes — server-only; no better-auth imports)
// ---------------------------------------------------------------------------

interface CodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface TokenSuccessResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface TokenErrorResponse {
  error:
    | "authorization_pending"
    | "slow_down"
    | "expired_token"
    | "access_denied"
    | "invalid_grant"
    | "invalid_request";
  error_description?: string;
}

interface GetSessionResponse {
  user?: { id?: string };
  session?: { userId?: string };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DevicePairingOptions {
  /** Base URL of the server, e.g. "https://luke.silcameroon.org". */
  baseUrl: string;
  /**
   * Called once the user code is available (before opening the browser).
   * Callers should display the code so the user can copy/retype it if the
   * auto-open lands in the wrong browser profile.
   */
  onUserCode?: (userCode: string) => void;
  /**
   * Structured-log sink for audit events.
   * Defaults to console.log.
   * MUST NOT receive token values — only event name, userId, and timestamp.
   */
  log?: (message: string) => void;
  /**
   * Async sleep implementation. Injectable for unit tests.
   * Defaults to a real setTimeout-based sleep.
   */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// DevicePairing
// ---------------------------------------------------------------------------

/**
 * RFC 8628 device-grant pairing flow for the Electron desktop.
 *
 * Call `startPairing()` to run the full flow:
 *   1. POST /api/auth/device/code  — request a pairing code.
 *   2. shell.openExternal(verification_uri_complete)  — open the browser.
 *   3. onUserCode(user_code)  — expose the code for desktop display.
 *   4. Poll POST /api/auth/device/token every `interval` seconds.
 *   5. On approval: fetch userId from GET /api/auth/get-session (best-effort),
 *      emit a structured audit log, and return { status:'approved', token }.
 *   6. On decline/expiry: return the corresponding PairingResult.
 *
 * Security invariants:
 *   - The `device_code` (polling secret) is NEVER logged or exposed in a URL.
 *   - The `access_token` is NEVER logged — only userId + event name + timestamp.
 *   - No better-auth server code is imported; credential is obtained over HTTP only.
 */
export class DevicePairing {
  private readonly baseUrl: string;
  private readonly onUserCode: (userCode: string) => void;
  private readonly log: (message: string) => void;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor({ baseUrl, onUserCode, log, sleep }: DevicePairingOptions) {
    this.baseUrl = baseUrl;
    this.onUserCode = onUserCode ?? (() => {});
    this.log = log ?? console.log;
    this.sleep = sleep ?? defaultSleep;
  }

  /**
   * Run the RFC 8628 device-grant pairing flow.
   *
   * Returns a `PairingHandle` immediately once the user code is available so
   * callers can display it in the UI. `handle.completion` resolves when the
   * polling loop finishes.
   *
   * @returns A PairingHandle with `userCode` and `completion`.
   * @throws PairingRateLimitedError when the server returns HTTP 429 on the
   *   code-request step (before the handle is returned).
   */
  async startPairing(): Promise<PairingHandle> {
    const codeData = await this.requestCode();

    // Expose the user code for display before opening the browser.
    this.onUserCode(codeData.user_code);

    // Open the browser to the link page with the code pre-filled.
    // The device_code (polling secret) is carried only in the poll body — never in any URL.
    await shell.openExternal(codeData.verification_uri_complete);

    return {
      userCode: codeData.user_code,
      completion: this.poll(codeData.device_code, codeData.interval),
    };
  }

  // ---------------------------------------------------------------------------
  // Private: code request
  // ---------------------------------------------------------------------------

  private async requestCode(): Promise<CodeResponse> {
    try {
      const response = await Axios.post<CodeResponse>(`${this.baseUrl}/api/auth/device/code`, {
        client_id: CLIENT_ID,
      });
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 429) {
        throw new PairingRateLimitedError(
          "Too many pairing code requests from this device. Please wait a moment and try again."
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: polling loop
  // ---------------------------------------------------------------------------

  private async poll(deviceCode: string, intervalSeconds: number): Promise<PairingResult> {
    let currentInterval = intervalSeconds;

    for (;;) {
      await this.sleep(currentInterval * 1000);

      try {
        const response = await Axios.post<TokenSuccessResponse>(
          `${this.baseUrl}/api/auth/device/token`,
          {
            grant_type: DEVICE_GRANT_TYPE,
            device_code: deviceCode,
            client_id: CLIENT_ID,
          }
        );

        // Approval — token received.  Never log the token value.
        const token = response.data.access_token;
        await this.emitPairedAuditLog(token);
        return { status: "approved", token };
      } catch (err) {
        const axiosErr = err as AxiosError;

        if (axiosErr.response?.status === 429) {
          throw new PairingRateLimitedError(
            "Too many poll requests. Please wait a moment before trying again."
          );
        }

        if (axiosErr.response?.status === 400) {
          const data = axiosErr.response.data as TokenErrorResponse;
          switch (data.error) {
            case "authorization_pending":
              // Keep polling — no interval change.
              continue;

            case "slow_down":
              // Per RFC 8628 §3.5: the client MUST increase its polling interval by 5 s.
              currentInterval += 5;
              continue;

            case "access_denied":
              return { status: "declined" };

            case "expired_token":
            case "invalid_grant":
              return { status: "expired" };

            default:
              throw err;
          }
        }

        throw err;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: audit log
  // ---------------------------------------------------------------------------

  /**
   * Emit a structured audit log line after a successful token receipt.
   *
   * Fetches userId from GET /api/auth/get-session using the token as a
   * Bearer credential so that the token itself is never recorded.
   * This call is best-effort: a failure falls back to userId='unknown' and
   * MUST NOT abort or surface an error to the caller.
   */
  private async emitPairedAuditLog(token: string): Promise<void> {
    let userId = "unknown";
    try {
      const response = await Axios.get<GetSessionResponse>(`${this.baseUrl}/api/auth/get-session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const resolved = response.data?.user?.id ?? response.data?.session?.userId;
      if (resolved) userId = resolved;
    } catch {
      // Best-effort: session fetch failure must not break the pairing result.
    }

    const auditEntry = {
      event: "device-paired",
      userId,
      timestamp: new Date().toISOString(),
    };
    this.log(`[AUDIT] ${JSON.stringify(auditEntry)}`);
  }
}
