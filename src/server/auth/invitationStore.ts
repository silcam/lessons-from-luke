/**
 * invitationStore.ts — CREATE path
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-006
 * Plan: plan.md §Project Structure (invitationStore.ts), data-model.md
 */
import crypto from "crypto";
import { Pool } from "pg";
import {
  generateToken,
  hashToken,
  encryptToken,
  buildInvitationLink,
} from "./invitationTokens";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class AccountExistsError extends Error {
  code = "ACCOUNT_EXISTS" as const;
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = "AccountExistsError";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvitationRole = "admin" | "standard";

export interface CreateInvitationInput {
  email: string;
  role: string;
  invitedBy: string;
  baseUrl: string;
  cookieSecret: string;
}

export interface CreateInvitationResult {
  id: string;
  email: string;
  role: InvitationRole;
  status: "pending";
  tokenHash: string;
  link: string;
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): void {
  if (email.length > 254) {
    throw new InvalidEmailError(`Email exceeds 254 characters`);
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new InvalidEmailError(`Invalid email format: ${email}`);
  }
}

function validateRole(role: string): asserts role is InvitationRole {
  if (role !== "admin" && role !== "standard") {
    throw new InvalidRoleError(role);
  }
}

// ---------------------------------------------------------------------------
// createInvitation
// ---------------------------------------------------------------------------

/**
 * Creates a new pending invitation in the database.
 *
 * Steps:
 * 1. Validate email (length, format) and role
 * 2. Lazy-expire: flip any expired pending rows for this email to 'expired'
 * 3. Check for existing user account (→ AccountExistsError)
 * 4. Generate token, hash, and encrypt it
 * 5. INSERT invitation row
 * 6. On pg 23505: branch on constraint name
 *    - uq_invitation_one_pending_email → ActivePendingError
 *    - idx_invitation_tokenHash → retry once with new token
 *    - other → rethrow
 */
export async function createInvitation(
  pool: Pool,
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const { role, invitedBy, baseUrl, cookieSecret } = input;

  // 1. Validate
  validateEmail(input.email);
  validateRole(role);

  const email = input.email.toLowerCase();

  const client = await pool.connect();
  try {
    // 2. Lazy-expire: transition any past-due pending rows to 'expired'
    await client.query(
      `UPDATE "invitation" SET status='expired'
       WHERE LOWER(email) = $1 AND status = 'pending' AND "expiresAt" <= now()`,
      [email],
    );

    // 3. Check for existing user account
    const userCheck = await client.query<{ id: string }>(
      `SELECT 1 FROM "user" WHERE LOWER(email) = $1 LIMIT 1`,
      [email],
    );
    if (userCheck.rows.length > 0) {
      throw new AccountExistsError(email);
    }

    // 4. Build invitation — with one retry on tokenHash collision
    return await attemptInsert(client, {
      email,
      role,
      invitedBy,
      baseUrl,
      cookieSecret,
      isRetry: false,
    });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Internal: single INSERT attempt (called at most twice)
// ---------------------------------------------------------------------------

interface AttemptInsertParams {
  email: string;
  role: InvitationRole;
  invitedBy: string;
  baseUrl: string;
  cookieSecret: string;
  isRetry: boolean;
}

async function attemptInsert(
  client: import("pg").PoolClient,
  params: AttemptInsertParams,
): Promise<CreateInvitationResult> {
  const { email, role, invitedBy, baseUrl, cookieSecret, isRetry } = params;

  const id = crypto.randomUUID();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const tokenEnc = encryptToken(token, cookieSecret);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    await client.query(
      `INSERT INTO "invitation"
         ("id","email","role","status","tokenHash","tokenEnc","invitedBy","createdAt","expiresAt")
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8)`,
      [id, email, role, tokenHash, tokenEnc, invitedBy, now, expiresAt],
    );
  } catch (err: unknown) {
    if (isPgUniqueViolation(err)) {
      const constraint = getConstraintName(err);
      if (constraint === "uq_invitation_one_pending_email") {
        throw new ActivePendingError(email);
      }
      if (
        constraint === "idx_invitation_tokenHash" ||
        constraint === "invitation_tokenhash_key" ||
        (typeof constraint === "string" &&
          constraint.toLowerCase().includes("tokenhash"))
      ) {
        if (isRetry) {
          // Two consecutive collisions is astronomically unlikely — surface as
          // generic error rather than infinite loop
          throw new Error(
            `tokenHash collision on retry — cannot insert invitation for ${email}`,
          );
        }
        return attemptInsert(client, { ...params, isRetry: true });
      }
      throw err;
    }
    throw err;
  }

  const link = buildInvitationLink(token, baseUrl);

  return { id, email, role, status: "pending", tokenHash, link, expiresAt };
}

// ---------------------------------------------------------------------------
// pg error helpers
// ---------------------------------------------------------------------------

interface PgError {
  code: string;
  constraint?: string;
}

function isPgUniqueViolation(err: unknown): err is PgError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as PgError).code === "23505"
  );
}

function getConstraintName(err: PgError): string | undefined {
  return err.constraint;
}
