/**
 * userValidation.ts — STUB for the RED task (lessons-from-luke-q8m0.5.2).
 *
 * The full implementation ships in the GREEN task (lessons-from-luke-q8m0.5.3),
 * which mirrors src/server/auth/invitationValidation.ts. This stub exists only
 * so the module resolves for TypeScript/ESLint (avoiding a compile error that
 * would mask the intended assertion-level RED state). Every behavioral export
 * below is deliberately wrong so userValidation.test.ts fails on assertion.
 *
 * Spec: specs/006-user-account-management/spec.md §FR-003..FR-009, §FR-012
 * Plan: data-model.md §API response shape, §Store operations
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountRole = "admin" | "standard";
export type AccountStatus = "active" | "deactivated";

// ---------------------------------------------------------------------------
// Error classes (stub — code/message deliberately wrong; see GREEN task)
// ---------------------------------------------------------------------------

export class UserNotFoundError extends Error {
  code = "" as const;
  constructor(id: string) {
    super("not implemented — GREEN task lessons-from-luke-q8m0.5.3");
    void id;
    this.name = "UserNotFoundError";
  }
}

export class LastAdminError extends Error {
  code = "" as const;
  constructor() {
    super("not implemented — GREEN task lessons-from-luke-q8m0.5.3");
    this.name = "LastAdminError";
  }
}

export class SelfDeactivationError extends Error {
  code = "" as const;
  constructor() {
    super("not implemented — GREEN task lessons-from-luke-q8m0.5.3");
    this.name = "SelfDeactivationError";
  }
}

export class InvalidRoleError extends Error {
  code = "" as const;
  constructor(value: unknown) {
    super("not implemented — GREEN task lessons-from-luke-q8m0.5.3");
    void value;
    this.name = "InvalidRoleError";
  }
}

// ---------------------------------------------------------------------------
// Validation helpers (stub — always throws a generic Error, never validates)
// ---------------------------------------------------------------------------

export function parseAccountRole(value: unknown): AccountRole {
  void value;
  throw new Error("not implemented — GREEN task lessons-from-luke-q8m0.5.3");
}
