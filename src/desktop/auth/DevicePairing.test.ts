/// <reference types="jest" />

jest.mock("electron", () => ({
  shell: {
    openExternal: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("axios");

import Axios from "axios";
import { shell } from "electron";
import { DevicePairing, PairingRateLimitedError } from "./DevicePairing";

const mockAxios = Axios as jest.Mocked<typeof Axios>;
const mockOpenExternal = shell.openExternal as jest.Mock;

const BASE_URL = "http://localhost:8081";
const CLIENT_ID = "lessons-from-luke-desktop";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const CODE_RESPONSE = {
  device_code: "secret-device-code-never-shown",
  user_code: "WDJB-MJHT",
  verification_uri: `${BASE_URL}/link`,
  verification_uri_complete: `${BASE_URL}/link?user_code=WDJB-MJHT`,
  expires_in: 600,
  interval: 5,
};

const SESSION_RESPONSE = {
  user: { id: "user-123" },
  session: { id: "session-abc", userId: "user-123" },
};

/** Build a fake Axios 400 error with the given RFC 8628 error code. */
function makeRfc8628Error(error: string, status = 400): Error {
  return Object.assign(new Error(`Axios ${status}: ${error}`), {
    isAxiosError: true,
    response: { status, data: { error } },
  });
}

/** Build a fake Axios error with the given HTTP status (no 400-style body). */
function makeHttpError(status: number): Error {
  return Object.assign(new Error(`Axios error ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });
}

/** Create a DevicePairing instance with a no-op sleep so tests run instantly. */
function makePairing(opts: {
  onUserCode?: (code: string) => void;
  log?: (msg: string) => void;
} = {}): DevicePairing {
  return new DevicePairing({
    baseUrl: BASE_URL,
    sleep: () => Promise.resolve(),
    ...opts,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: requestCode succeeds.
  mockAxios.post = jest.fn();
  mockAxios.get = jest.fn();
});

// ---------------------------------------------------------------------------
// Approved path
// ---------------------------------------------------------------------------
describe("approved path", () => {
  test("returns {status:'approved', token} when poll succeeds on first try", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE }) // POST /device/code
      .mockResolvedValueOnce({ data: { access_token: "session-token-xyz", token_type: "Bearer" } }); // POST /device/token
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE }); // GET /get-session

    const pairing = makePairing();
    const result = await pairing.startPairing();

    expect(result).toEqual({ status: "approved", token: "session-token-xyz" });
  });

  test("passes through authorization_pending then succeeds on second poll", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE }) // POST /device/code
      .mockRejectedValueOnce(makeRfc8628Error("authorization_pending")) // poll 1
      .mockResolvedValueOnce({ data: { access_token: "session-token-xyz", token_type: "Bearer" } }); // poll 2
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = makePairing();
    const result = await pairing.startPairing();

    expect(result).toEqual({ status: "approved", token: "session-token-xyz" });
    // Code was polled twice.
    expect(mockAxios.post).toHaveBeenCalledTimes(3); // /code + poll1 + poll2
  });

  test("exposes user_code via onUserCode callback before opening the browser", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const receivedCodes: string[] = [];
    const pairing = makePairing({ onUserCode: (code) => receivedCodes.push(code) });
    await pairing.startPairing();

    expect(receivedCodes).toEqual(["WDJB-MJHT"]);
  });

  test("opens browser to verification_uri_complete via shell.openExternal", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = makePairing();
    await pairing.startPairing();

    expect(mockOpenExternal).toHaveBeenCalledWith(`${BASE_URL}/link?user_code=WDJB-MJHT`);
  });

  test("POSTs to /device/code with correct client_id", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = makePairing();
    await pairing.startPairing();

    expect(mockAxios.post).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/api/auth/device/code`,
      { client_id: CLIENT_ID }
    );
  });

  test("POSTs to /device/token with grant_type, device_code, and client_id (no logging of device_code)", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = makePairing();
    await pairing.startPairing();

    expect(mockAxios.post).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/api/auth/device/token`,
      {
        grant_type: DEVICE_GRANT_TYPE,
        device_code: CODE_RESPONSE.device_code,
        client_id: CLIENT_ID,
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Declined path
// ---------------------------------------------------------------------------
describe("declined path", () => {
  test("returns {status:'declined'} when poll returns access_denied", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockRejectedValueOnce(makeRfc8628Error("access_denied"));

    const pairing = makePairing();
    const result = await pairing.startPairing();

    expect(result).toEqual({ status: "declined" });
  });
});

// ---------------------------------------------------------------------------
// Expired path
// ---------------------------------------------------------------------------
describe("expired path", () => {
  test("returns {status:'expired'} when poll returns expired_token", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockRejectedValueOnce(makeRfc8628Error("expired_token"));

    const pairing = makePairing();
    const result = await pairing.startPairing();

    expect(result).toEqual({ status: "expired" });
  });

  test("returns {status:'expired'} when poll returns invalid_grant", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockRejectedValueOnce(makeRfc8628Error("invalid_grant"));

    const pairing = makePairing();
    const result = await pairing.startPairing();

    expect(result).toEqual({ status: "expired" });
  });
});

// ---------------------------------------------------------------------------
// slow_down backoff
// ---------------------------------------------------------------------------
describe("slow_down backoff", () => {
  test("increases poll interval by 5 seconds on slow_down then succeeds", async () => {
    const sleepTimes: number[] = [];

    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE }) // /device/code (interval: 5)
      .mockRejectedValueOnce(makeRfc8628Error("slow_down")) // poll 1 → interval → 10
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } }); // poll 2
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = new DevicePairing({
      baseUrl: BASE_URL,
      sleep: (ms) => {
        sleepTimes.push(ms);
        return Promise.resolve();
      },
    });
    const result = await pairing.startPairing();

    expect(result).toEqual({ status: "approved", token: "tok" });
    // First sleep: 5 s, then slow_down raises to 10 s, second sleep: 10 s.
    expect(sleepTimes).toEqual([5000, 10000]);
  });

  test("accumulates multiple slow_down increments", async () => {
    const sleepTimes: number[] = [];

    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE }) // interval: 5
      .mockRejectedValueOnce(makeRfc8628Error("slow_down")) // → 10
      .mockRejectedValueOnce(makeRfc8628Error("slow_down")) // → 15
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = new DevicePairing({
      baseUrl: BASE_URL,
      sleep: (ms) => {
        sleepTimes.push(ms);
        return Promise.resolve();
      },
    });
    await pairing.startPairing();

    expect(sleepTimes).toEqual([5000, 10000, 15000]);
  });
});

// ---------------------------------------------------------------------------
// 429 handling
// ---------------------------------------------------------------------------
describe("429 handling", () => {
  test("throws PairingRateLimitedError when /device/code returns 429", async () => {
    mockAxios.post.mockRejectedValueOnce(makeHttpError(429));

    const pairing = makePairing();
    await expect(pairing.startPairing()).rejects.toBeInstanceOf(PairingRateLimitedError);
  });

  test("throws PairingRateLimitedError when /device/token poll returns 429", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockRejectedValueOnce(makeHttpError(429));

    const pairing = makePairing();
    await expect(pairing.startPairing()).rejects.toBeInstanceOf(PairingRateLimitedError);
  });

  test("PairingRateLimitedError has a user-readable message", async () => {
    mockAxios.post.mockRejectedValueOnce(makeHttpError(429));

    const pairing = makePairing();
    try {
      await pairing.startPairing();
      fail("Expected PairingRateLimitedError");
    } catch (err) {
      expect(err).toBeInstanceOf(PairingRateLimitedError);
      expect((err as PairingRateLimitedError).message).toMatch(/wait/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------
describe("audit logging", () => {
  test("emits structured audit log on successful pairing with userId — no token value", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "super-secret-token", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const logLines: string[] = [];
    const pairing = makePairing({ log: (msg) => logLines.push(msg) });
    await pairing.startPairing();

    expect(logLines).toHaveLength(1);
    const logLine = logLines[0];
    expect(logLine).toContain("device-paired");
    expect(logLine).toContain("user-123");
    expect(logLine).not.toContain("super-secret-token");
  });

  test("audit log GETs /api/auth/get-session with Authorization: Bearer token", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "session-token-xyz", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const pairing = makePairing();
    await pairing.startPairing();

    expect(mockAxios.get).toHaveBeenCalledWith(
      `${BASE_URL}/api/auth/get-session`,
      { headers: { Authorization: "Bearer session-token-xyz" } }
    );
  });

  test("audit log still emits with userId='unknown' if get-session call fails", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockRejectedValueOnce(new Error("Network error"));

    const logLines: string[] = [];
    const pairing = makePairing({ log: (msg) => logLines.push(msg) });
    const result = await pairing.startPairing();

    // Pairing should still succeed.
    expect(result).toEqual({ status: "approved", token: "tok" });
    expect(logLines).toHaveLength(1);
    expect(logLines[0]).toContain("unknown");
    expect(logLines[0]).not.toContain("tok");
  });

  test("audit log includes ISO timestamp", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockResolvedValueOnce({ data: { access_token: "tok", token_type: "Bearer" } });
    mockAxios.get.mockResolvedValueOnce({ data: SESSION_RESPONSE });

    const logLines: string[] = [];
    const pairing = makePairing({ log: (msg) => logLines.push(msg) });
    await pairing.startPairing();

    // ISO 8601 timestamp pattern
    expect(logLines[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("does not emit audit log on declined pairing", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockRejectedValueOnce(makeRfc8628Error("access_denied"));

    const logLines: string[] = [];
    const pairing = makePairing({ log: (msg) => logLines.push(msg) });
    await pairing.startPairing();

    expect(logLines).toHaveLength(0);
  });

  test("does not emit audit log on expired pairing", async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: CODE_RESPONSE })
      .mockRejectedValueOnce(makeRfc8628Error("expired_token"));

    const logLines: string[] = [];
    const pairing = makePairing({ log: (msg) => logLines.push(msg) });
    await pairing.startPairing();

    expect(logLines).toHaveLength(0);
  });
});
