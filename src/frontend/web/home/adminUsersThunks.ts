/**
 * adminUsersThunks.ts — Redux thunks for admin user list and device revocation
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Plan: specs/004-desktop-auth-pairing/plan.md §Project Structure
 *       (frontend/web/home/AdminHome.tsx)
 *
 * GET  /api/admin/users                              → AdminUserRow[]
 * POST /api/admin/users/:userId/revoke-sessions      → { success, userId, revokedCount }
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

/** A user row returned by GET /api/admin/users */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  admin: boolean;
}

export interface AdminUsersError {
  code: "not_found" | "network_error" | "unknown_error";
  message: string;
}

// ---------------------------------------------------------------------------
// listAdminUsers — GET /api/admin/users
// ---------------------------------------------------------------------------

export const listAdminUsers = createAsyncThunk<
  AdminUserRow[],
  void,
  { rejectValue: AdminUsersError }
>("adminUsers/listAdminUsers", async (_, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch("/api/admin/users", { method: "GET" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    return (await response.json()) as AdminUserRow[];
  }

  return rejectWithValue({ code: "unknown_error", message: "Failed to load users" });
});

// ---------------------------------------------------------------------------
// revokeUserDeviceAccess — POST /api/admin/users/:userId/revoke-sessions
// ---------------------------------------------------------------------------

export const revokeUserDeviceAccess = createAsyncThunk<
  { userId: string; revokedCount: number },
  string,
  { rejectValue: AdminUsersError }
>("adminUsers/revokeUserDeviceAccess", async (userId, { rejectWithValue }) => {
  let response: Response;
  try {
    response = await fetch(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" });
  } catch {
    return rejectWithValue({ code: "network_error", message: "Network error" });
  }

  if (response.ok) {
    const body = (await response.json()) as {
      success: boolean;
      userId: string;
      revokedCount: number;
    };
    return { userId: body.userId ?? userId, revokedCount: body.revokedCount };
  }

  let body: { error?: string } = {};
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
