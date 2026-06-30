/**
 * Jest manual mock for src/frontend/web/auth/authClient.ts
 *
 * The frontend jest project maps ".*web/auth/authClient" to this file via
 * moduleNameMapper so that Jest's CJS runner does not attempt to load
 * better-auth/react (an ESM-only package).
 *
 * Individual tests set up return values via:
 *   (authClient.getSession as jest.Mock).mockResolvedValue(...)
 *   (authClient.signIn.email as jest.Mock).mockResolvedValue(...)
 *   (authClient.signOut as jest.Mock).mockResolvedValue(...)
 *   (authClient.requestPasswordReset as jest.Mock).mockResolvedValue(...)
 *   (authClient.resetPassword as jest.Mock).mockResolvedValue(...)
 *
 * jest.clearAllMocks() in beforeEach resets call counts and return values
 * between tests.
 */

export const authClient = {
  getSession: jest.fn(),
  signIn: {
    email: jest.fn(),
  },
  signOut: jest.fn(),
  /** Request a password-reset link (better-auth built-in, US1). */
  requestPasswordReset: jest.fn(),
  /** Set a new password via a reset token (better-auth built-in, US1). */
  resetPassword: jest.fn(),
};
