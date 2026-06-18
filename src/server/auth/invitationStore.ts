/**
 * invitationStore.ts — CREATE, LOOKUP, and ACCEPT paths
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-012
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
import * as passwordHasher from "./passwordHasher";

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

export class AccountAlreadyExistsError extends Error {
  code = "ACCOUNT_ALREADY_EXISTS" as const;
  constructor(email: string) {
    super(`An account already exists for ${email}`);
    this.name = "AccountAlreadyExistsError";
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
// Types
// ---------------------------------------------------------------------------

export type InvitationRole = "admin" | "standard";
export type InvitationStatus = "pending" | "accepted" | "expired" | "retracted";

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

export interface InvitationSummary {
  id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedByEmail: string;
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
 * 3. Check for existing user account (-> AccountExistsError)
 * 4. Generate token, hash, and encrypt it
 * 5. INSERT invitation row
 * 6. On pg 23505: branch on constraint name
 *    - uq_invitation_one_pending_email -> ActivePendingError
 *    - idx_invitation_tokenHash -> retry once with new token
 *    - other -> rethrow
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

    // 4. Build invitation -- with one retry on tokenHash collision
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
          // Two consecutive collisions is astronomically unlikely -- surface as
          // generic error rather than infinite loop
          throw new Error(
            `tokenHash collision on retry -- cannot insert invitation for ${email}`,
            { cause: err },
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

// ---------------------------------------------------------------------------
// lookupInvitation
// ---------------------------------------------------------------------------

/**
 * Looks up a pending, non-expired invitation by its plaintext token.
 *
 * Non-leaky: returns null for any invalid condition (not found, accepted,
 * retracted, expired) rather than distinguishing between them (FR-010).
 *
 * @returns { email } if valid, null otherwise.
 */
export async function lookupInvitation(
  pool: Pool,
  token: string,
): Promise<{ email: string } | null> {
  const tokenHash = hashToken(token);

  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string;
      email: string;
      status: string;
      expiresAt: Date;
    }>(
      `SELECT id, email, status, "expiresAt" FROM "invitation" WHERE "tokenHash" = $1 LIMIT 1`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    if (row.status !== "pending") {
      return null;
    }

    if (new Date(row.expiresAt) <= new Date()) {
      return null;
    }

    return { email: row.email };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// acceptInvitation
// ---------------------------------------------------------------------------

/**
 * Returns true if the string contains any ASCII control character
 * (code points 0x00..0x1F) or a standalone CR/LF.
 * Implemented as a function rather than a regex to avoid the no-control-regex
 * lint rule, which disallows U+0000..U+001F in regex patterns.
 */
function hasControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 0x1f) {
      return true;
    }
  }
  return false;
}

/**
 * Accepts an invitation: validates inputs, atomically flips the invitation
 * to 'accepted', and creates user + credential account rows.
 *
 * Steps:
 * 1. Validate password length (12..128) -- BEFORE hashing (performance ordering)
 * 2. Validate name: trim, reject empty, reject control chars, check length <= 100
 * 3. Hash token -> tokenHash; SELECT invitation row
 * 4. BEGIN transaction:
 *    a. Conditional UPDATE invitation -> status='accepted' WHERE status='pending' AND expiresAt > now()
 *    b. If 0 rows updated -> ROLLBACK -> throw InvalidLinkError
 *    c. Hash password (Argon2id)
 *    d. INSERT user row
 *    e. INSERT account row
 *    f. Catch pg 23505 on user insert -> ROLLBACK -> throw AccountAlreadyExistsError
 *    g. COMMIT
 * 5. Return { email }
 */
export async function acceptInvitation(
  pool: Pool,
  token: string,
  password: string,
  name: string,
  _cookieSecret: string,
): Promise<{ email: string }> {
  // 1. Validate password length
  if (password.length < 12) {
    throw new ValidationError("Password must be at least 12 characters");
  }
  if (password.length > 128) {
    throw new ValidationError("Password must be at most 128 characters");
  }

  // 2. Validate name
  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError("Name must not be empty");
  }
  if (hasControlChars(trimmedName)) {
    throw new ValidationError(
      "Name must not contain control characters or newlines",
    );
  }
  if (trimmedName.length > 100) {
    throw new ValidationError("Name must be at most 100 characters");
  }

  // 3. Hash token and look up the invitation row
  const tokenHash = hashToken(token);

  const client = await pool.connect();
  try {
    const invitationResult = await client.query<{
      id: string;
      email: string;
      role: string;
    }>(
      `SELECT id, email, role FROM "invitation" WHERE "tokenHash" = $1 LIMIT 1`,
      [tokenHash],
    );

    if (invitationResult.rows.length === 0) {
      throw new InvalidLinkError();
    }

    const invitation = invitationResult.rows[0];

    // 4. Begin transaction
    await client.query("BEGIN");

    try {
      // 4a. Conditional UPDATE: only update if status='pending' AND expiresAt > now()
      const updateResult = await client.query<{ id: string }>(
        `UPDATE "invitation"
         SET status = 'accepted', "acceptedAt" = now()
         WHERE id = $1 AND status = 'pending' AND "expiresAt" > now()
         RETURNING id`,
        [invitation.id],
      );

      // 4b. If 0 rows updated, the invitation is no longer valid OR was just
      //     accepted concurrently (SC-003). Distinguish the cases by checking
      //     whether an account now exists for this email. If it does, a concurrent
      //     request beat us to it → AccountAlreadyExistsError (409). Otherwise
      //     the invitation is expired/retracted → InvalidLinkError (410).
      if (updateResult.rows.length === 0) {
        const accountCheck = await client.query<{ id: string }>(
          `SELECT 1 FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [invitation.email],
        );
        await client.query("ROLLBACK");
        if (accountCheck.rows.length > 0) {
          throw new AccountAlreadyExistsError(invitation.email);
        }
        throw new InvalidLinkError();
      }

      // 4c. Hash the password (Argon2id)
      const hashedPassword = await passwordHasher.hash(password);

      // 4d. INSERT user row
      const userId = crypto.randomUUID();
      const now = new Date();
      const isAdmin = invitation.role === "admin";

      try {
        await client.query(
          `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
           VALUES ($1, LOWER($2), $3, $4, false, $5, $5)`,
          [userId, invitation.email, trimmedName, isAdmin, now],
        );
      } catch (userInsertErr: unknown) {
        if (isPgUniqueViolation(userInsertErr)) {
          await client.query("ROLLBACK");
          throw new AccountAlreadyExistsError(invitation.email);
        }
        throw userInsertErr;
      }

      // 4e. INSERT account row
      const accountId = crypto.randomUUID();
      await client.query(
        `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
         VALUES ($1, $2, $2, 'credential', $3, $4, $4)`,
        [accountId, userId, hashedPassword, now],
      );

      // 4g. COMMIT
      await client.query("COMMIT");

      // 5. Return { email }
      return { email: invitation.email };
    } catch (txErr) {
      // Ensure we roll back on any unexpected error inside the transaction
      // (the explicit ROLLBACK calls above handle known error paths)
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors -- the original error is more important
      }
      throw txErr;
    }
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// listInvitations — STUB (RED: not yet implemented)
// ---------------------------------------------------------------------------

/**
 * Lists all invitations ordered newest-first.
 * Resolves invitedByEmail via JOIN to the user table.
 * Never returns tokenHash or tokenEnc.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-013..FR-019
 * Data model: data-model.md §Management-list query
 *
 * NOT YET IMPLEMENTED — stub exists only so the RED test file compiles.
 */
export async function listInvitations(_pool: Pool): Promise<InvitationSummary[]> {
  throw new Error("listInvitations: not yet implemented");
}

// ---------------------------------------------------------------------------
// retractInvitation — STUB (RED: not yet implemented)
// ---------------------------------------------------------------------------

/**
 * Retracts a pending invitation by id.
 * Uses a conditional UPDATE (WHERE status='pending') to prevent TOCTOU races.
 * Returns the updated InvitationSummary with invitedByEmail resolved via JOIN.
 *
 * Throws NotFoundError if the id does not exist.
 * Throws NotPendingError if the invitation is not in pending state.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-015
 * Data model: data-model.md §State machine (retract conditional UPDATE — plan.md Pass 11)
 *
 * NOT YET IMPLEMENTED — stub exists only so the RED test file compiles.
 */
export async function retractInvitation(_pool: Pool, _id: string): Promise<InvitationSummary> {
  throw new Error("retractInvitation: not yet implemented");
}

// ---------------------------------------------------------------------------
// getInvitationLink — STUB (RED: not yet implemented)
// ---------------------------------------------------------------------------

/**
 * Re-copies the original invitation link by decrypting tokenEnc.
 * Returns { link } where link is the re-derived invitation URL.
 *
 * Throws NotFoundError if the id does not exist.
 * Throws NotPendingError if the invitation is not in pending state.
 * Throws DecryptError if tokenEnc cannot be decrypted (e.g. wrong cookieSecret).
 *
 * Spec: specs/002-invitation-system/spec.md §FR-016
 * Data model: data-model.md §tokenEnc encryption rules
 *
 * NOT YET IMPLEMENTED — stub exists only so the RED test file compiles.
 */
export async function getInvitationLink(
  _pool: Pool,
  _id: string,
  _cookieSecret: string,
): Promise<{ link: string }> {
  throw new Error("getInvitationLink: not yet implemented");
}
