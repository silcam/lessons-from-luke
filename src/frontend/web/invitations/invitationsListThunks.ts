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
// fetchInvitationAction — shared fetch + error-mapping helper
//
// Performs the fetch, catches network errors, and — on a non-ok response —
// best-effort parses the JSON error body and maps the HTTP status code to an
// InvitationsListError via `statusCodeMap` (falling back to `fallback` for
// unmapped statuses). On success, the caller receives the raw Response to
// parse into whatever payload shape it needs.
// ---------------------------------------------------------------------------

type StatusCodeMap = Partial<
  Record<number, { code: InvitationsListError["code"]; defaultMessage: string }>
>;

async function fetchInvitationAction(
  url: string,
  init: RequestInit,
  statusCodeMap: StatusCodeMap,
  fallback: { code: InvitationsListError["code"]; defaultMessage: string }
): Promise<{ response: Response } | { error: InvitationsListError }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { error: { code: "network_error", message: "Network error" } };
  }

  if (response.ok) {
    return { response };
  }

  let body: { error?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  const mapped = statusCodeMap[response.status] ?? fallback;
  return { error: { code: mapped.code, message: body.error ?? mapped.defaultMessage } };
}

// ---------------------------------------------------------------------------
// listInvitations — GET /api/admin/invitations
// ---------------------------------------------------------------------------

export const listInvitations = createAsyncThunk<
  InvitationSummaryRow[],
  void,
  { rejectValue: InvitationsListError }
>("invitationsList/listInvitations", async (_, { rejectWithValue }) => {
  const result = await fetchInvitationAction(
    "/api/admin/invitations",
    { method: "GET" },
    {},
    { code: "unknown_error", defaultMessage: "Failed to load invitations" }
  );

  if ("error" in result) {
    return rejectWithValue(result.error);
  }

  return (await result.response.json()) as InvitationSummaryRow[];
});

// ---------------------------------------------------------------------------
// retractInvitation — POST /api/admin/invitations/:id/retract
// ---------------------------------------------------------------------------

export const retractInvitation = createAsyncThunk<
  InvitationSummaryRow,
  string,
  { rejectValue: InvitationsListError }
>("invitationsList/retractInvitation", async (id, { rejectWithValue }) => {
  const result = await fetchInvitationAction(
    `/api/admin/invitations/${id}/retract`,
    { method: "POST" },
    {
      404: { code: "not_found", defaultMessage: "Invitation not found" },
      409: { code: "not_pending", defaultMessage: "Invitation is not pending" },
    },
    { code: "unknown_error", defaultMessage: "Unknown error" }
  );

  if ("error" in result) {
    return rejectWithValue(result.error);
  }

  return (await result.response.json()) as InvitationSummaryRow;
});

// ---------------------------------------------------------------------------
// getInvitationLink — GET /api/admin/invitations/:id/link
// ---------------------------------------------------------------------------

export const getInvitationLink = createAsyncThunk<
  { id: string; link: string },
  string,
  { rejectValue: InvitationsListError }
>("invitationsList/getInvitationLink", async (id, { rejectWithValue }) => {
  const result = await fetchInvitationAction(
    `/api/admin/invitations/${id}/link`,
    { method: "GET" },
    {
      404: { code: "not_found", defaultMessage: "Invitation not found" },
      409: { code: "not_pending", defaultMessage: "Invitation is not pending" },
    },
    { code: "link_unavailable", defaultMessage: "Link unavailable" }
  );

  if ("error" in result) {
    return rejectWithValue(result.error);
  }

  const body = (await result.response.json()) as { link: string };
  return { id, link: body.link };
});

// ---------------------------------------------------------------------------
// resendInvitationEmail — POST /api/admin/invitations/:id/resend
// ---------------------------------------------------------------------------

export interface ResendInvitationEmailResult {
  id: string;
  emailSent: boolean;
}

export const resendInvitationEmail = createAsyncThunk<
  ResendInvitationEmailResult,
  string,
  { rejectValue: InvitationsListError }
>("invitationsList/resendInvitationEmail", async (id, { rejectWithValue }) => {
  const result = await fetchInvitationAction(
    `/api/admin/invitations/${id}/resend`,
    { method: "POST" },
    {
      404: { code: "not_found", defaultMessage: "Invitation not found" },
      409: { code: "not_pending", defaultMessage: "Invitation is not pending" },
      429: {
        code: "throttled",
        defaultMessage: "Too many resend requests. Please try again later.",
      },
    },
    { code: "unknown_error", defaultMessage: "Unknown error" }
  );

  if ("error" in result) {
    return rejectWithValue(result.error);
  }

  const body = (await result.response.json()) as { emailSent: boolean };
  return { id, emailSent: body.emailSent };
});
