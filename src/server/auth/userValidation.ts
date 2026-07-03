/**
 * userValidation.ts — Domain error classes and input validation helpers for
 * user account administration (roster, role changes, deactivation).
 *
 * Spec: specs/006-user-account-management/spec.md §FR-003..FR-009, §FR-012
 * Plan: data-model.md §API response shape, §Store operations
 *
 * Mirrors src/server/auth/invitationValidation.ts. Error `code` values match
 * contracts/user-admin-api.yaml's `Error.code` enum.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountRole = "admin" | "standard";
export type AccountStatus = "active" | "deactivated";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown when an admin action targets an account id that does not exist.
 */
export class UserNotFoundError extends Error {
  code = "USER_NOT_FOUND" as const;
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = "UserNotFoundError";
  }
}

/**
 * Thrown when an action (demote or deactivate) would leave the roster with
 * no remaining active admin.
 */
export class LastAdminError extends Error {
  code = "LAST_ADMIN" as const;
  constructor() {
    super("Cannot remove the last active admin account");
    this.name = "LastAdminError";
  }
}

/**
 * Thrown when an admin attempts to deactivate their own account.
 */
export class SelfDeactivationError extends Error {
  code = "SELF_DEACTIVATION" as const;
  constructor() {
    super("You cannot deactivate your own account");
    this.name = "SelfDeactivationError";
  }
}

/**
 * Thrown when a role value is neither 'admin' nor 'standard'.
 */
export class InvalidRoleError extends Error {
  code = "INVALID_ROLE" as const;
  constructor(value: unknown) {
    super(`Invalid role: ${String(value)}. Must be 'admin' or 'standard'`);
    this.name = "InvalidRoleError";
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function parseAccountRole(value: unknown): AccountRole {
  if (value !== "admin" && value !== "standard") {
    throw new InvalidRoleError(value);
  }
  return value;
}
