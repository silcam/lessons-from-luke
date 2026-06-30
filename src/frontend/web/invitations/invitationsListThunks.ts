/**
 * invitationsListThunks.ts — Redux thunks for admin invitation list/retract/recopy API calls
 *
 * Spec: specs/002-invitation-system/spec.md §US3, §FR-013..FR-016
 * Plan: plan.md §Presentation Design (InvitationsList component)
 *
 * GET  /api/admin/invitations         → InvitationSummary[]
 * POST /api/admin/invitations/:id/retract → InvitationSummary (updated)
 * GET  /api/admin/invitations/:id/link → { link: string }
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { InvitationSummaryRow } from "../../../core/interfaces/Api";

export type { InvitationSummaryRow };

export interface InvitationsListError {
  code:
    | "not_found"
    | "not_pending"
    | "link_unavailable"
    | "throttled"
    | "network_error"
    | "unknown_error";
  message: string;
}

// ---------------------------------------------------------------------------
// listInvitations — GET /api/admin/invitations
// ---------------------------------------------------------------------------

export const listInvitations = createAsyncThunk<
  InvitationSummaryRow[],
  void,
  { rejectValue: InvitationsListError }
>("invitationsList/listInvitations", async (_, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch("/api/admin/invitations", { method: "GET" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as InvitationSummaryRow[];
  }

  return rejectWithValue({ code: "unknown_error", message: "Failed to load invitations" });
});

// ---------------------------------------------------------------------------
// retractInvitation — POST /api/admin/invitations/:id/retract
// ---------------------------------------------------------------------------

export const retractInvitation = createAsyncThunk<
  InvitationSummaryRow,
  string,
  { rejectValue: InvitationsListError }
>("invitationsList/retractInvitation", async (id, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/admin/invitations/${id}/retract`, { method: "POST" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as InvitationSummaryRow;
  }

  let body: { error?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  if (response.status === 404) {
    return rejectWithValue({ code: "not_found", message: body.error ?? "Invitation not found" });
  }

  if (response.status === 409) {
    return rejectWithValue({
      code: "not_pending",
      message: body.error ?? "Invitation is not pending",
    });
  }

  return rejectWithValue({ code: "unknown_error", message: body.error ?? "Unknown error" });
});

// ---------------------------------------------------------------------------
// getInvitationLink — GET /api/admin/invitations/:id/link
// ---------------------------------------------------------------------------

export const getInvitationLink = createAsyncThunk<
  { id: string; link: string },
  string,
  { rejectValue: InvitationsListError }
>("invitationsList/getInvitationLink", async (id, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/admin/invitations/${id}/link`, { method: "GET" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    const body = (await response.json()) as { link: string };
    return { id, link: body.link };
  }

  let body: { error?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  if (response.status === 404) {
    return rejectWithValue({ code: "not_found", message: body.error ?? "Invitation not found" });
  }

  if (response.status === 409) {
    return rejectWithValue({
      code: "not_pending",
      message: body.error ?? "Invitation is not pending",
    });
  }

  return rejectWithValue({
    code: "link_unavailable",
    message: body.error ?? "Link unavailable",
  });
});

// ---------------------------------------------------------------------------
// resendInvitationEmail — POST /api/admin/invitations/:id/resend
// ---------------------------------------------------------------------------

export interface ResendInvitationEmailResult {
  id: string;
  emailSent: boolean;
}

/**
 * RED STUB — exports the correct type signature but does not yet call fetch
 * or handle the 404/409/429 responses. Tests in invitationsListThunks.test.ts
 * will fail until the GREEN task (lessons-from-luke-5qjl.5.4.6) implements
 * the real behavior.
 */
export const resendInvitationEmail = createAsyncThunk<
  ResendInvitationEmailResult,
  string,
  { rejectValue: InvitationsListError }
>("invitationsList/resendInvitationEmail", async (_id, _thunkApi) => {
  return { id: "", emailSent: false };
});
