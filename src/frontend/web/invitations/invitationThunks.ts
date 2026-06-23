/**
 * invitationThunks.ts — Redux thunks for admin invitation API calls
 *
 * Spec: specs/002-invitation-system/spec.md §US1, §FR-001..FR-006
 * Plan: plan.md §Presentation Design §UI Decisions (Create-invitation form)
 *
 * POST /api/admin/invitations → { id, email, role, status, link, expiresAt }
 *
 * Error shape: { code: 'account_exists' | 'active_pending' | 'validation_error' | 'network_error', message: string }
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { InvitationResult } from "../../../core/api/ApiContracts";

export type { InvitationResult };

export interface InvitationError {
  code: "account_exists" | "active_pending" | "validation_error" | "network_error";
  message: string;
}

export const createInvitation = createAsyncThunk<
  InvitationResult,
  { email: string; role: string },
  { rejectValue: InvitationError }
>("invitations/createInvitation", async ({ email, role }, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as InvitationResult;
  }

  let body: { error?: string; code?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore parse error */
  }

  const errorText = body.error ?? "";

  if (response.status === 409) {
    if (body.code === "ACCOUNT_EXISTS") {
      return rejectWithValue({ code: "account_exists", message: errorText });
    }
    if (body.code === "PENDING_INVITE_EXISTS") {
      return rejectWithValue({ code: "active_pending", message: errorText });
    }
    // Unknown 409 variant — treat as generic
    return rejectWithValue({ code: "validation_error", message: errorText });
  }

  return rejectWithValue({ code: "validation_error", message: errorText });
});
