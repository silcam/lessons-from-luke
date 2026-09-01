/**
 * deviceLinkThunks.ts — Redux thunks for the device link (pairing) approval flow
 *
 * Spec: specs/004-desktop-auth-pairing/plan.md §Project Structure (frontend/web/deviceLink/)
 * Plan: data-model.md §Entity 1 (two-step claim-then-approve flow)
 *
 * Two-step flow (required by the better-auth device-authorization plugin):
 *   1. claimCode(userCode) — GET /api/auth/device?user_code=<userCode>
 *      Associates the signed-in user's session with the deviceCode row (sets userId).
 *      MUST be called on DeviceLinkPage mount BEFORE approveCode/denyCode.
 *      Without this step, approveCode returns DEVICE_CODE_NOT_CLAIMED.
 *   2. approveCode(userCode) — POST /api/auth/device/approve with { userCode }
 *      Transitions the deviceCode row to "approved"; the desktop's next /device/token
 *      poll will receive the session token.
 *   3. denyCode(userCode) — POST /api/auth/device/deny with { userCode }
 *      Transitions the deviceCode row to "denied"; the desktop gets access_denied.
 *
 * Error shape: { code: DeviceLinkErrorCode, message: string }
 *   not_claimed  — 400 DEVICE_CODE_NOT_CLAIMED (approve without prior claim)
 *   expired      — 410 (code past its 10-minute window)
 *   rate_limited — 429 (brute-force / flood protection)
 *   network_error — any other failure
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

export type DeviceLinkErrorCode = "not_claimed" | "expired" | "rate_limited" | "network_error";

export interface DeviceLinkError {
  code: DeviceLinkErrorCode;
  message: string;
}

/** Claim result: the plugin returns an empty body or minimal JSON on a successful claim. */
export type ClaimCodeResult = Record<string, unknown>;
/** Approve result: empty body on success. */
export type ApproveCodeResult = Record<string, unknown>;
/** Deny result: empty body on success. */
export type DenyCodeResult = Record<string, unknown>;

/**
 * Parse a non-OK response into a DeviceLinkError.
 * Shared by all three thunks to keep error handling consistent.
 */
async function parseError(
  response: Response,
  errorCodeFor400: DeviceLinkErrorCode = "network_error"
): Promise<DeviceLinkError> {
  let body: { error?: string } = {};
  try {
    body = (await response.json()) as { error?: string };
  } catch {
    /* ignore parse error */
  }
  const message = body.error ?? "";

  if (response.status === 400) {
    return { code: errorCodeFor400, message };
  }
  if (response.status === 410) {
    return { code: "expired", message };
  }
  if (response.status === 429) {
    return { code: "rate_limited", message };
  }
  return { code: "network_error", message };
}

/**
 * claimCode — Step 1 of the device link flow.
 *
 * GET /api/auth/device?user_code=<userCode>
 *
 * Associates the signed-in user's session with the pending deviceCode row. This MUST be
 * dispatched on DeviceLinkPage mount before approveCode or denyCode are called.
 */
export const claimCode = createAsyncThunk<
  ClaimCodeResult,
  string,
  { rejectValue: DeviceLinkError }
>("deviceLink/claimCode", async (userCode, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/auth/device?user_code=${encodeURIComponent(userCode)}`, {
      method: "GET",
    });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as ClaimCodeResult;
  }

  return rejectWithValue(await parseError(response));
});

/**
 * approveCode — Step 2a of the device link flow.
 *
 * POST /api/auth/device/approve with { userCode }
 *
 * Approves the pairing request. claimCode MUST have been called first; without it the
 * server returns 400 DEVICE_CODE_NOT_CLAIMED.
 */
export const approveCode = createAsyncThunk<
  ApproveCodeResult,
  string,
  { rejectValue: DeviceLinkError }
>("deviceLink/approveCode", async (userCode, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch("/api/auth/device/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCode }),
    });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as ApproveCodeResult;
  }

  return rejectWithValue(await parseError(response, "not_claimed"));
});

/**
 * denyCode — Step 2b of the device link flow.
 *
 * POST /api/auth/device/deny with { userCode }
 *
 * Declines the pairing request. The desktop's next /device/token poll receives
 * access_denied and the deviceCode row is deleted.
 */
export const denyCode = createAsyncThunk<DenyCodeResult, string, { rejectValue: DeviceLinkError }>(
  "deviceLink/denyCode",
  async (userCode, { rejectWithValue }) => {
    let response: Response;
    try {
      response = await fetch("/api/auth/device/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode }),
      });
    } catch {
      return rejectWithValue({ code: "network_error", message: "Network error" });
    }

    if (response.ok) {
      return (await response.json()) as DenyCodeResult;
    }

    return rejectWithValue(await parseError(response));
  }
);
