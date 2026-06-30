/**
 * passwordResetThunks.ts — Redux thunks for self-service password reset
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1
 * Plan: plan.md §Presentation Design (UI Decisions)
 * Contract: specs/005-transactional-email-reset/contracts/auth-password-reset-api.yaml
 *
 * RED STUB — exports the correct type signatures but does not yet call authClient
 * or handle errors. Tests in passwordResetThunks.test.ts will fail until the
 * GREEN task (lessons-from-luke-5qjl.5.3.6) implements the real behavior.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

export interface PasswordResetError {
  code: "invalid_token" | "password_too_short" | "password_too_long" | "network_error";
  message: string;
}

/**
 * Request a password-reset link for the given email address.
 *
 * The response is always the same generic confirmation whether or not the email
 * is registered (enumeration-safe, FR-007 / SC-004).
 *
 * RED STUB — does not call authClient. Tests will fail.
 */
export const requestPasswordReset = createAsyncThunk<
  void,
  string,
  { rejectValue: PasswordResetError }
>("passwordReset/requestPasswordReset", async (_email, _thunkApi) => {
  return undefined;
});

/**
 * Set a new password using a valid single-use reset token.
 *
 * On success, the password is updated and all other sessions for the account are
 * revoked (FR-009 / SC-005).
 *
 * RED STUB — does not call authClient. Tests will fail.
 */
export const resetPassword = createAsyncThunk<
  void,
  { token: string; newPassword: string },
  { rejectValue: PasswordResetError }
>("passwordReset/resetPassword", async (_args, _thunkApi) => {
  return undefined;
});
