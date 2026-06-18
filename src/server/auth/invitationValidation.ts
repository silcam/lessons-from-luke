/**
 * invitationValidation.ts — Domain error classes and input validation helpers
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-012
 * Plan: plan.md §Project Structure (invitationStore.ts)
 *
 * Extracted from invitationStore.ts (task 9c7.17) to keep the store as pure
 * DB access code. Import error classes and validators from here in both
 * invitationStore.ts and invitationController.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvitationRole = "admin" | "standard";
export type InvitationStatus = "pending" | "accepted" | "expired" | "retracted";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/**
 * Thrown at create-invitation time: an account is already registered for
 * this email, so no invitation can be issued.
 */
export class AccountAlreadyRegisteredError extends Error {
  code = "ACCOUNT_EXISTS" as const;
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = "AccountAlreadyRegisteredError";
  }
}

export class ActivePendingError extends Error {
  code = "PENDING_INVITE_EXISTS" as const;
  constructor(email: string) {
    super(`An active pending invitation already exists for ${email}`);
    this.name = "ActivePendingError";
  }
}

export class InvalidEmailError extends Error {
  code = "INVALID_EMAIL" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmailError";
  }
}

export class InvalidRoleError extends Error {
  code = "INVALID_ROLE" as const;
  constructor(role: string) {
    super(`Invalid role: ${role}. Must be 'admin' or 'standard'`);
    this.name = "InvalidRoleError";
  }
}

export class InvalidLinkError extends Error {
  code = "INVALID_LINK" as const;
  constructor(message = "Invitation link is invalid, expired, or already used") {
    super(message);
    this.name = "InvalidLinkError";
  }
}

export class ValidationError extends Error {
  code = "VALIDATION_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Thrown at accept-invitation time: a concurrent request (or duplicate submit)
 * already created an account for the bound email — this request lost the race.
 */
export class AccountCreatedConcurrentlyError extends Error {
  code = "ACCOUNT_ALREADY_EXISTS" as const;
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = "AccountCreatedConcurrentlyError";
  }
}

export class NotFoundError extends Error {
  code = "NOT_FOUND" as const;
  constructor(id: string) {
    super(`Invitation not found: ${id}`);
    this.name = "NotFoundError";
  }
}

export class NotPendingError extends Error {
  code = "NOT_PENDING" as const;
  constructor(id: string) {
    super(`Invitation ${id} is not in pending state`);
    this.name = "NotPendingError";
  }
}

export class DecryptError extends Error {
  code = "DECRYPT_ERROR" as const;
  constructor(message = "Failed to decrypt invitation token") {
    super(message);
    this.name = "DecryptError";
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): void {
  if (email.length > 254) {
    throw new InvalidEmailError(`Email exceeds 254 characters`);
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new InvalidEmailError(`Invalid email format: ${email}`);
  }
}

export function validateRole(role: string): asserts role is InvitationRole {
  if (role !== "admin" && role !== "standard") {
    throw new InvalidRoleError(role);
  }
}
