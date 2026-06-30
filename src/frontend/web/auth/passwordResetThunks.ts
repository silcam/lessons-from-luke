/**
 * passwordResetThunks.ts — Redux thunks for self-service password reset
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1
 * Plan: plan.md §Presentation Design (UI Decisions)
 * Contract: specs/005-transactional-email-reset/contracts/auth-password-reset-api.yaml
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { authClient } from "./authClient";

export interface PasswordResetError {
  code: "invalid_token" | "password_too_short" | "password_too_long" | "network_error";
  message: string;
}

type BetterAuthResult<T> = {
  data: T | null;
  error: { message?: string; code?: string; status?: number } | null;
};

/**
 * Request a password-reset link for the given email address.
 *
 * The response is always the same generic confirmation whether or not the email
 * is registered (enumeration-safe, FR-007 / SC-004).
 */
export const requestPasswordReset = createAsyncThunk<
  void,
  string,
  { rejectValue: PasswordResetError }
>("passwordReset/requestPasswordReset", async (email, { rejectWithValue }) => {
  // authClient is the better-auth client; its requestPasswordReset returns { data, error }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = (await (authClient as any).requestPasswordReset({
    email,
  })) as BetterAuthResult<{ status: boolean }>;

  if (error) {
    return rejectWithValue({
      code: "network_error",
      message: error.message ?? "An error occurred. Please try again.",
    });
  }
  return undefined;
});

/**
 * Set a new password using a valid single-use reset token.
 *
 * On success, the password is updated and all other sessions for the account are
 * revoked (FR-009 / SC-005).
 */
export const resetPassword = createAsyncThunk<
  void,
  { token: string; newPassword: string },
  { rejectValue: PasswordResetError }
>("passwordReset/resetPassword", async ({ token, newPassword }, { rejectWithValue }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = (await (authClient as any).resetPassword({
    token,
    newPassword,
  })) as BetterAuthResult<{ status: boolean }>;

  if (error) {
    const rawCode = (error.code ?? "").toUpperCase();
    let code: PasswordResetError["code"] = "network_error";
    if (rawCode === "INVALID_TOKEN") {
      code = "invalid_token";
    } else if (rawCode === "PASSWORD_TOO_SHORT") {
      code = "password_too_short";
    } else if (rawCode === "PASSWORD_TOO_LONG") {
      code = "password_too_long";
    }
    return rejectWithValue({
      code,
      message: error.message ?? "An error occurred. Please try again.",
    });
  }
  return undefined;
});
