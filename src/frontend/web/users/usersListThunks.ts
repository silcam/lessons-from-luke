/**
 * usersListThunks.ts — Redux thunk for the admin user roster API call
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002
 * Plan: plan.md §Presentation Design §UI Decisions (Users roster page)
 *
 * GET /api/admin/users → UserAccountRow[]
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { UserAccountRow } from "../../../core/interfaces/Api";

export type { UserAccountRow };

export interface UsersListError {
  code: "network_error" | "unknown_error";
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
