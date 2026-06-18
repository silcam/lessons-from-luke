/**
 * redeemInvitationThunks.ts — Redux thunks for anonymous invitation redemption API calls
 *
 * Spec: specs/002-invitation-system/spec.md §US2, §FR-007..FR-012
 * Plan: plan.md §UI Decisions (Recipient redemption form), §Security Considerations (Pass 9)
 *
 * GET /api/auth/invitation/:token → { email }
 * POST /api/auth/invitation/accept → { email }
 *
 * Error shape: { code: 'invalid_link' | 'rate_limited' | 'validation_error' | 'network_error', message: string }
 * Three-way error branch (Pass 9): 410 → terminal invalid_link; 429 → transient rate_limited;
 * other non-200 → network_error — a valid link MUST NOT read as dead.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { APIGet, APIPost } from "../../../core/interfaces/Api";

export type RedemptionLookupResult = APIGet["/api/auth/invitation/:token"][1];
export type RedemptionAcceptResult = APIPost["/api/auth/invitation/accept"][2];

export interface RedemptionError {
  code: "invalid_link" | "rate_limited" | "validation_error" | "network_error";
  message: string;
}

export const lookupInvitation = createAsyncThunk<
  RedemptionLookupResult,
  string,
  { rejectValue: RedemptionError }
>("invitations/lookupInvitation", async (token, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/auth/invitation/${token}`, { method: "GET" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as RedemptionLookupResult;
  }

  let body: { error?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore parse error */
  }

  const errorText = body.error ?? "";

  if (response.status === 410) {
    return rejectWithValue({ code: "invalid_link", message: errorText });
  }
  if (response.status === 429) {
    return rejectWithValue({ code: "rate_limited", message: errorText });
  }
  return rejectWithValue({ code: "network_error", message: errorText });
});

export const acceptInvitation = createAsyncThunk<
  RedemptionAcceptResult,
  { token: string; password: string; name: string },
  { rejectValue: RedemptionError }
>(
  "invitations/acceptInvitation",
  async ({ token, password, name }, { rejectWithValue }) => {
    let response: Response;
    try {
      response = await fetch("/api/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name }),
      });
    } catch {
      return rejectWithValue({ code: "network_error", message: "Network error" });
    }

    if (response.ok) {
      return (await response.json()) as RedemptionAcceptResult;
    }

    let body: { error?: string } = {};
    try {
      body = await response.json();
    } catch {
      /* ignore parse error */
    }

    const errorText = body.error ?? "";

    if (response.status === 400) {
      return rejectWithValue({ code: "validation_error", message: errorText });
    }
    if (response.status === 410 || response.status === 409) {
      // 409 = already accepted/retracted while form was open — treat as terminal invalid_link
      return rejectWithValue({ code: "invalid_link", message: errorText });
    }
    if (response.status === 429) {
      return rejectWithValue({ code: "rate_limited", message: errorText });
    }
    return rejectWithValue({ code: "network_error", message: errorText });
  }
);
