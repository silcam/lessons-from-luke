/**
 * passwordResetThunks.test.ts — unit tests for password-reset Redux thunks
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1 Acceptance Scenarios
 * Contract: specs/005-transactional-email-reset/contracts/auth-password-reset-api.yaml
 * Skills: /typescript-unit-testing
 *
 * authClient is automatically redirected to src/frontend/__mocks__/authClient.ts by
 * jest.config.js moduleNameMapper. Both this test file and the module under test share
 * the same mock instance, so mock setup here is visible to passwordResetThunks.ts.
 */

import { requestPasswordReset, resetPassword } from "./passwordResetThunks";

const { authClient } = require("./authClient") as {
  authClient: {
    requestPasswordReset: jest.Mock;
    resetPassword: jest.Mock;
  };
};

describe("passwordResetThunks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── requestPasswordReset ───────────────────────────────────────────────────

  describe("requestPasswordReset", () => {
    it("calls authClient.requestPasswordReset with the provided email", async () => {
      authClient.requestPasswordReset.mockResolvedValue({
        data: { status: true },
        error: null,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await requestPasswordReset("user@example.com")(dispatch, getState, undefined);

      expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
        email: "user@example.com",
      });
    });

    it("on authClient success, dispatches the fulfilled action", async () => {
      authClient.requestPasswordReset.mockResolvedValue({
        data: { status: true },
        error: null,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await requestPasswordReset("user@example.com")(dispatch, getState, undefined);

      // authClient must have been called first (the success precondition)
      expect(authClient.requestPasswordReset).toHaveBeenCalled();

      // The fulfilled action is the "success action" in RTK createAsyncThunk convention
      const dispatchedTypes = dispatch.mock.calls.map(
        ([action]: [{ type?: string }]) => action.type
      );
      expect(dispatchedTypes).toContain("passwordReset/requestPasswordReset/fulfilled");
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe("resetPassword", () => {
    it("calls authClient.resetPassword with the token and newPassword", async () => {
      authClient.resetPassword.mockResolvedValue({
        data: { status: true },
        error: null,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resetPassword({
        token: "reset-tok-abc123",
        newPassword: "new-password-123!",
      })(dispatch, getState, undefined);

      expect(authClient.resetPassword).toHaveBeenCalledWith({
        token: "reset-tok-abc123",
        newPassword: "new-password-123!",
      });
    });

    it("on authClient success, dispatches the fulfilled action", async () => {
      authClient.resetPassword.mockResolvedValue({
        data: { status: true },
        error: null,
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resetPassword({
        token: "reset-tok-abc123",
        newPassword: "new-password-123!",
      })(dispatch, getState, undefined);

      expect(authClient.resetPassword).toHaveBeenCalled();

      const dispatchedTypes = dispatch.mock.calls.map(
        ([action]: [{ type?: string }]) => action.type
      );
      expect(dispatchedTypes).toContain("passwordReset/resetPassword/fulfilled");
    });

    it("on INVALID_TOKEN error, dispatches rejected action with code 'invalid_token'", async () => {
      authClient.resetPassword.mockResolvedValue({
        data: null,
        error: {
          code: "INVALID_TOKEN",
          message: "This link has expired or already been used.",
        },
      });

      const dispatch = jest.fn();
      const getState = jest.fn();

      await resetPassword({
        token: "expired-or-used-token",
        newPassword: "new-password-123!",
      })(dispatch, getState, undefined);

      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "passwordReset/resetPassword/rejected",
          payload: expect.objectContaining({ code: "invalid_token" }),
        })
      );
    });
  });
});
