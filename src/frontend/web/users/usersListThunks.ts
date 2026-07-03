/**
 * usersListThunks.ts — Redux thunks for the admin user roster + deactivate/
 * reactivate/role-change API calls
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §US2, §US3, §FR-001,
 *       §FR-002, §FR-003, §FR-004, §FR-005..FR-008, §FR-011
 * Plan: plan.md §Presentation Design §UI Decisions (Users roster page,
 *       Deactivate/Reactivate row action, Role promote/demote row action)
 *
 * GET  /api/admin/users                       → UserAccountRow[]
 * POST /api/admin/users/:id/deactivate        → UserAccountRow (updated)
 * POST /api/admin/users/:id/reactivate        → UserAccountRow (updated)
 * POST /api/admin/users/:id/role              → UserAccountRow (updated)
 * POST /api/admin/users/:id/revoke-sessions   → UserAccountRow & { revoked: number }
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { UserAccountRow } from "../../../core/interfaces/Api";

export type { UserAccountRow };

export interface UsersListError {
  code: "network_error" | "unknown_error";
  message: string;
}

export interface UserMutationError {
  code: "not_found" | "last_admin" | "self_deactivation" | "network_error" | "unknown_error";
  message: string;
}

// ---------------------------------------------------------------------------
// listUsers — GET /api/admin/users
// ---------------------------------------------------------------------------

export const listUsers = createAsyncThunk<UserAccountRow[], void, { rejectValue: UsersListError }>(
  "usersList/listUsers",
  async (_, { rejectWithValue }) => {
    let response: Response;
    try {
      response = await fetch("/api/admin/users", { method: "GET" });
    } catch {
      return rejectWithValue({ code: "network_error", message: "Network error" });
    }

    if (response.ok) {
      return (await response.json()) as UserAccountRow[];
    }

    return rejectWithValue({ code: "unknown_error", message: "Failed to load users" });
  }
);

// ---------------------------------------------------------------------------
// mutationRequest — shared fetch/error-handling helper for the 4 mutation
// thunks below. Each thunk supplies only its URL/verb/body and an optional
// `extraStatusMap` for status codes beyond the common 404 -> not_found /
// fallback -> unknown_error mapping (e.g. deactivateAccount's/changeRole's
// 409 LAST_ADMIN / SELF_DEACTIVATION branches).
// ---------------------------------------------------------------------------

type MutationResult<T> = { ok: true; data: T } | { ok: false; error: UserMutationError };

async function mutationRequest<T>(
  url: string,
  init: RequestInit,
  extraStatusMap?: (
    status: number,
    body: { error?: string; code?: string }
  ) => UserMutationError | undefined
): Promise<MutationResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, error: { code: "network_error", message: "Network error" } };
  }

  if (response.ok) {
    return { ok: true, data: (await response.json()) as T };
  }

  let body: { error?: string; code?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  if (response.status === 404) {
    return { ok: false, error: { code: "not_found", message: body.error ?? "User not found" } };
  }

  const extra = extraStatusMap?.(response.status, body);
  if (extra) {
    return { ok: false, error: extra };
  }

  return { ok: false, error: { code: "unknown_error", message: body.error ?? "Unknown error" } };
}

// ---------------------------------------------------------------------------
// deactivateAccount — POST /api/admin/users/:id/deactivate
// ---------------------------------------------------------------------------

export const deactivateAccount = createAsyncThunk<
  UserAccountRow,
  string,
  { rejectValue: UserMutationError }
>("usersList/deactivateAccount", async (id, { rejectWithValue }) => {
  const result = await mutationRequest<UserAccountRow>(
    `/api/admin/users/${id}/deactivate`,
    { method: "POST" },
    (status, body) => {
      if (status === 409 && body.code === "LAST_ADMIN") {
        return {
          code: "last_admin",
          message: body.error ?? "Cannot remove the last active admin account",
        };
      }
      if (status === 409 && body.code === "SELF_DEACTIVATION") {
        return {
          code: "self_deactivation",
          message: body.error ?? "You cannot deactivate your own account",
        };
      }
      return undefined;
    }
  );

  return result.ok ? result.data : rejectWithValue(result.error);
});

// ---------------------------------------------------------------------------
// reactivateAccount — POST /api/admin/users/:id/reactivate
// ---------------------------------------------------------------------------

export const reactivateAccount = createAsyncThunk<
  UserAccountRow,
  string,
  { rejectValue: UserMutationError }
>("usersList/reactivateAccount", async (id, { rejectWithValue }) => {
  const result = await mutationRequest<UserAccountRow>(`/api/admin/users/${id}/reactivate`, {
    method: "POST",
  });

  return result.ok ? result.data : rejectWithValue(result.error);
});

// ---------------------------------------------------------------------------
// changeRole — POST /api/admin/users/:id/role (US3, promote/demote)
// ---------------------------------------------------------------------------

export const changeRole = createAsyncThunk<
  UserAccountRow,
  { id: string; role: "admin" | "standard" },
  { rejectValue: UserMutationError }
>("usersList/changeRole", async ({ id, role }, { rejectWithValue }) => {
  const result = await mutationRequest<UserAccountRow>(
    `/api/admin/users/${id}/role`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    },
    (status, body) => {
      if (status === 409 && body.code === "LAST_ADMIN") {
        return {
          code: "last_admin",
          message: body.error ?? "Cannot demote the last active admin account",
        };
      }
      return undefined;
    }
  );

  return result.ok ? result.data : rejectWithValue(result.error);
});

// ---------------------------------------------------------------------------
// revokeSessions — POST /api/admin/users/:id/revoke-sessions (US4, force
// sign-out without deactivating)
// ---------------------------------------------------------------------------

export const revokeSessions = createAsyncThunk<
  UserAccountRow & { revoked: number },
  string,
  { rejectValue: UserMutationError }
>("usersList/revokeSessions", async (id, { rejectWithValue }) => {
  const result = await mutationRequest<UserAccountRow & { revoked: number }>(
    `/api/admin/users/${id}/revoke-sessions`,
    { method: "POST" }
  );

  return result.ok ? result.data : rejectWithValue(result.error);
});
