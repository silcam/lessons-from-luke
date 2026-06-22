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
  decryptToken,
  buildInvitationLink,
} from "./invitationTokens";
import * as passwordHasher from "./passwordHasher";
import type { InvitationRole, InvitationStatus } from "./invitationValidation";
import {
  validateEmail,
  validateRole,
  AccountAlreadyRegisteredError,
  ActivePendingError,
  InvalidLinkError,
  ValidationError,
  AccountCreatedConcurrentlyError,
  NotFoundError,
  NotPendingError,
  DecryptError,
} from "./invitationValidation";

export type { InvitationRole, InvitationStatus } from "./invitationValidation";
export {
  AccountAlreadyRegisteredError,
  ActivePendingError,
  InvalidLinkError,
  ValidationError,
  AccountCreatedConcurrentlyError,
  NotFoundError,
  NotPendingError,
  DecryptError,
} from "./invitationValidation";

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
// createInvitation
// ---------------------------------------------------------------------------

/**
 * Creates a new pending invitation in the database.
 *
 * Steps:
 * 1. Validate email (length, format) and role
 * 2. Lazy-expire: flip any expired pending rows for this email to 'expired'
 * 3. Check for existing user account (-> AccountAlreadyRegisteredError)
 * 4. Generate token, hash, and encrypt it
 * 5. INSERT invitation row
 * 6. On pg 23505: branch on constraint name
 *    - uq_invitation_one_pending_email -> ActivePendingError
 *    - idx_invitation_tokenHash -> retry once with new token
 *    - other -> rethrow
 */
export async function createInvitation(
  pool: Pool,
  input: CreateInvitationInput
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
      [email]
    );

    // 3. Check for existing user account
    const userCheck = await client.query<{ id: string }>(
      `SELECT 1 FROM "user" WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (userCheck.rows.length > 0) {
      throw new AccountAlreadyRegisteredError(email);
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
  params: AttemptInsertParams
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
      [id, email, role, tokenHash, tokenEnc, invitedBy, now, expiresAt]
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
        (typeof constraint === "string" && constraint.toLowerCase().includes("tokenhash"))
      ) {
        if (isRetry) {
          // Two consecutive collisions is astronomically unlikely -- surface as
          // generic error rather than infinite loop
          throw new Error(`tokenHash collision on retry -- cannot insert invitation for ${email}`, {
            cause: err,
          });
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
  return typeof err === "object" && err !== null && (err as PgError).code === "23505";
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
  token: string
): Promise<{ email: string } | null> {
  const tokenHash = hashToken(token);

  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string;
      email: string;
      status: string;
      expiresAt: Date;
    }>(`SELECT id, email, status, "expiresAt" FROM "invitation" WHERE "tokenHash" = $1 LIMIT 1`, [
      tokenHash,
    ]);

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
 *    f. Catch pg 23505 on user insert -> ROLLBACK -> throw AccountCreatedConcurrentlyError
 *    g. COMMIT
 * 5. Return { email }
 */
export async function acceptInvitation(
  pool: Pool,
  token: string,
  password: string,
  name: string
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
    throw new ValidationError("Name must not contain control characters or newlines");
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
    }>(`SELECT id, email, role FROM "invitation" WHERE "tokenHash" = $1 LIMIT 1`, [tokenHash]);

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
        [invitation.id]
      );

      // 4b. If 0 rows updated, the invitation is no longer valid OR was just
      //     accepted concurrently (SC-003). Distinguish the cases by checking
      //     whether an account now exists for this email. If it does, a concurrent
      //     request beat us to it → AccountCreatedConcurrentlyError (409). Otherwise
      //     the invitation is expired/retracted → InvalidLinkError (410).
      if (updateResult.rows.length === 0) {
        const accountCheck = await client.query<{ id: string }>(
          `SELECT 1 FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [invitation.email]
        );
        await client.query("ROLLBACK");
        if (accountCheck.rows.length > 0) {
          throw new AccountCreatedConcurrentlyError(invitation.email);
        }
        throw new InvalidLinkError();
      }

      // 4c. Hash the password (Argon2id)
      const hashedPassword = await passwordHasher.hash(password);

      // 4d. INSERT user row.
      // emailVerified = true: the account is created only by redeeming an
      // admin-issued, email-bound, single-use invitation link sent to this exact
      // address, which proves control of the mailbox. Verified-by-redemption is
      // the honest value and keeps invited users from being locked out if
      // requireEmailVerification is enabled later.
      const userId = crypto.randomUUID();
      const now = new Date();
      const isAdmin = invitation.role === "admin";

      try {
        await client.query(
          `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
           VALUES ($1, LOWER($2), $3, $4, true, $5, $5)`,
          [userId, invitation.email, trimmedName, isAdmin, now]
        );
      } catch (userInsertErr: unknown) {
        if (isPgUniqueViolation(userInsertErr)) {
          await client.query("ROLLBACK");
          throw new AccountCreatedConcurrentlyError(invitation.email);
        }
        throw userInsertErr;
      }

      // 4e. INSERT account row
      const accountId = crypto.randomUUID();
      await client.query(
        `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
         VALUES ($1, $2, $2, 'credential', $3, $4, $4)`,
        [accountId, userId, hashedPassword, now]
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
// Shared row-mapper for InvitationSummary
// ---------------------------------------------------------------------------

interface InvitationRow {
  id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedByEmail: string;
}

function mapInvitationRow(row: InvitationRow): InvitationSummary {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    invitedByEmail: row.invitedByEmail,
  };
}

// ---------------------------------------------------------------------------
// listInvitations
// ---------------------------------------------------------------------------

/**
 * Lists all invitations ordered newest-first.
 * Lazy-expires any pending rows with past expiresAt before fetching.
 * Resolves invitedByEmail via JOIN to the user table.
 * Never returns tokenHash or tokenEnc.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-013..FR-019
 * Data model: data-model.md §Management-list query
 */
export async function listInvitations(pool: Pool): Promise<InvitationSummary[]> {
  const client = await pool.connect();
  try {
    // Lazy-expire: flip any pending rows with past expiresAt to 'expired'
    await client.query(
      `UPDATE "invitation" SET status='expired'
       WHERE status='pending' AND "expiresAt" <= now()`
    );

    const result = await client.query<InvitationRow>(
      `SELECT
         invitation.id,
         invitation.email,
         invitation.role,
         invitation.status,
         invitation."createdAt",
         invitation."expiresAt",
         invitation."acceptedAt",
         "user".email AS "invitedByEmail"
       FROM "invitation"
       INNER JOIN "user" ON "user".id = invitation."invitedBy"
       ORDER BY invitation."createdAt" DESC`
    );

    return result.rows.map(mapInvitationRow);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// retractInvitation
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
 */
export async function retractInvitation(pool: Pool, id: string): Promise<InvitationSummary> {
  const client = await pool.connect();
  try {
    // Atomic conditional UPDATE: only retract if currently pending
    const updateResult = await client.query<{ id: string }>(
      `UPDATE "invitation" SET status='retracted'
       WHERE id=$1 AND status='pending'
       RETURNING id`,
      [id]
    );

    if (updateResult.rows.length === 0) {
      // Check whether the row exists at all
      const existsResult = await client.query<{ id: string }>(
        `SELECT 1 FROM "invitation" WHERE id=$1 LIMIT 1`,
        [id]
      );
      if (existsResult.rows.length === 0) {
        throw new NotFoundError(id);
      }
      throw new NotPendingError(id);
    }

    // Fetch the full summary with invitedByEmail via JOIN
    const summaryResult = await client.query<InvitationRow>(
      `SELECT
         invitation.id,
         invitation.email,
         invitation.role,
         invitation.status,
         invitation."createdAt",
         invitation."expiresAt",
         invitation."acceptedAt",
         "user".email AS "invitedByEmail"
       FROM "invitation"
       INNER JOIN "user" ON "user".id = invitation."invitedBy"
       WHERE invitation.id = $1
       LIMIT 1`,
      [id]
    );

    return mapInvitationRow(summaryResult.rows[0]);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getInvitationLink
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
 */
export async function getInvitationLink(
  pool: Pool,
  id: string,
  baseUrl: string,
  cookieSecret: string
): Promise<{ link: string }> {
  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string;
      status: InvitationStatus;
      tokenEnc: string;
    }>(`SELECT id, status, "tokenEnc" FROM "invitation" WHERE id=$1 LIMIT 1`, [id]);

    if (result.rows.length === 0) {
      throw new NotFoundError(id);
    }

    const row = result.rows[0];

    if (row.status !== "pending") {
      throw new NotPendingError(id);
    }

    const token = decryptToken(row.tokenEnc, cookieSecret);
    if (token === null) {
      throw new DecryptError();
    }

    return { link: buildInvitationLink(token, baseUrl) };
  } finally {
    client.release();
  }
}
