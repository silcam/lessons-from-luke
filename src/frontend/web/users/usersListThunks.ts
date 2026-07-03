/**
 * usersListThunks.ts — Redux thunks for the admin user roster + deactivate/
 * reactivate/role-change API calls
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §US2, §US3, §FR-001,
 *       §FR-002, §FR-003, §FR-004, §FR-005..FR-008, §FR-011
 * Plan: plan.md §Presentation Design §UI Decisions (Users roster page,
 *       Deactivate/Reactivate row action, Role promote/demote row action)
 *
 * GET  /api/admin/users                 → UserAccountRow[]
 * POST /api/admin/users/:id/deactivate  → UserAccountRow (updated)
 * POST /api/admin/users/:id/reactivate  → UserAccountRow (updated)
 * POST /api/admin/users/:id/role        → UserAccountRow (updated)
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
// deactivateAccount — POST /api/admin/users/:id/deactivate
// ---------------------------------------------------------------------------

export const deactivateAccount = createAsyncThunk<
  UserAccountRow,
  string,
  { rejectValue: UserMutationError }
>("usersList/deactivateAccount", async (id, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/admin/users/${id}/deactivate`, { method: "POST" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as UserAccountRow;
  }

  let body: { error?: string; code?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  if (response.status === 404) {
    return rejectWithValue({ code: "not_found", message: body.error ?? "User not found" });
  }

  if (response.status === 409 && body.code === "LAST_ADMIN") {
    return rejectWithValue({
      code: "last_admin",
      message: body.error ?? "Cannot remove the last active admin account",
    });
  }

  if (response.status === 409 && body.code === "SELF_DEACTIVATION") {
    return rejectWithValue({
      code: "self_deactivation",
      message: body.error ?? "You cannot deactivate your own account",
    });
  }

  return rejectWithValue({ code: "unknown_error", message: body.error ?? "Unknown error" });
});

// ---------------------------------------------------------------------------
// reactivateAccount — POST /api/admin/users/:id/reactivate
// ---------------------------------------------------------------------------

export const reactivateAccount = createAsyncThunk<
  UserAccountRow,
  string,
  { rejectValue: UserMutationError }
>("usersList/reactivateAccount", async (id, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/admin/users/${id}/reactivate`, { method: "POST" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as UserAccountRow;
  }

  let body: { error?: string; code?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  if (response.status === 404) {
    return rejectWithValue({ code: "not_found", message: body.error ?? "User not found" });
  }

  return rejectWithValue({ code: "unknown_error", message: body.error ?? "Unknown error" });
});

// ---------------------------------------------------------------------------
// changeRole — POST /api/admin/users/:id/role (US3, promote/demote)
// ---------------------------------------------------------------------------

export const changeRole = createAsyncThunk<
  UserAccountRow,
  { id: string; role: "admin" | "standard" },
  { rejectValue: UserMutationError }
>("usersList/changeRole", async ({ id, role }, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/admin/users/${id}/role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as UserAccountRow;
  }

  let body: { error?: string; code?: string } = {};
  try {
    body = await response.json();
  } catch {
    /* ignore */
  }

  if (response.status === 404) {
    return rejectWithValue({ code: "not_found", message: body.error ?? "User not found" });
  }

  if (response.status === 409 && body.code === "LAST_ADMIN") {
    return rejectWithValue({
      code: "last_admin",
      message: body.error ?? "Cannot demote the last active admin account",
    });
  }

  return rejectWithValue({ code: "unknown_error", message: body.error ?? "Unknown error" });
});
