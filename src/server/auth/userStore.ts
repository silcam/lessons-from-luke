/**
 * userStore.ts — pure pg.Pool access for user account administration
 * (roster, role changes, deactivation), mirroring
 * src/server/auth/invitationStore.ts (no framework code).
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002, §FR-007
 * Plan: data-model.md §Store operations (listAccounts), §Entity: User Account
 *       (derived Role/Status)
 */
import { Pool } from "pg";
import type { AccountRole, AccountStatus } from "./userValidation";
import { UserNotFoundError, LastAdminError, SelfDeactivationError } from "./userValidation";

/**
 * The store-level shape of an account row: `Omit<UserAccountRow, "isSelf">`
 * (data-model.md §Store operations). `isSelf` has no meaning at the store
 * layer — it is injected by the controller from the requesting admin's id.
 */
export interface AccountSummary {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  admin: boolean;
  deactivatedAt: Date | null;
  createdAt: Date;
}

function mapUserRow(row: UserRow): AccountSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.admin ? "admin" : "standard",
    status: row.deactivatedAt === null ? "active" : "deactivated",
    createdAt: row.createdAt,
  };
}

/**
 * Lists every account in the roster, ordered by createdAt ascending.
 * Derives `role` from the `admin` boolean and `status` from `deactivatedAt`
 * (NULL -> active). Never returns password or session-token fields, and
 * does not set `isSelf` — that is injected by the controller per-request.
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002, §FR-007
 */
export async function listAccounts(pool: Pool): Promise<AccountSummary[]> {
  const client = await pool.connect();
  try {
    const result = await client.query<UserRow>(
      `SELECT id, email, name, admin, "deactivatedAt", "createdAt" FROM "user" ORDER BY "createdAt" ASC`
    );
    return result.rows.map(mapUserRow);
  } finally {
    client.release();
  }
}

/**
 * Deactivates a target account, revoking its sessions, inside a single
 * transaction guarded by the shared last-admin lock (data-model.md
 * §Last-admin lock).
 *
 * Self-lockout (FR-008) is checked BEFORE opening the transaction: an admin
 * may never deactivate their own account, so this never needs the DB at all
 * for that case.
 *
 * Steps (inside the transaction):
 * 1. Lock the active-admin set: `SELECT id FROM "user" WHERE admin = true
 *    AND "deactivatedAt" IS NULL ORDER BY id FOR UPDATE`. This serializes
 *    concurrent guarded mutations against the same row set (FR-012) — see
 *    the shared lock fragment in data-model.md.
 * 2. Fetch the target row (else `UserNotFoundError`).
 * 3. If the target is already deactivated, this is an idempotent no-op:
 *    COMMIT and return the current row unchanged.
 * 4. If the target is an active admin and the locked set has at most one
 *    row (i.e. the target is the only remaining active admin), ROLLBACK and
 *    throw `LastAdminError` — deactivating them would leave zero admins.
 * 5. Otherwise, conditionally UPDATE `deactivatedAt = now()` (guarded by
 *    `deactivatedAt IS NULL` to stay safe under races) and DELETE the
 *    target's sessions (FR-005 — deactivation revokes existing sessions
 *    immediately, not just future sign-ins). COMMIT and return the updated
 *    row.
 *
 * Spec: specs/006-user-account-management/spec.md §US2, §FR-005, §FR-007,
 *       §FR-008, §FR-012
 * Plan: data-model.md §Store operations (deactivateAccount),
 *       §Last-admin lock (shared fragment)
 */
export async function deactivateAccount(
  pool: Pool,
  actingUserId: string,
  targetId: string
): Promise<AccountSummary> {
  if (targetId === actingUserId) {
    throw new SelfDeactivationError();
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      // 1. Lock the active-admin set (shared fragment — data-model.md
      //    §Last-admin lock).
      const activeAdmins = await client.query<{ id: string }>(
        `SELECT id FROM "user" WHERE admin = true AND "deactivatedAt" IS NULL ORDER BY id FOR UPDATE`
      );

      // 2. Fetch the target row.
      const targetResult = await client.query<UserRow>(
        `SELECT id, email, name, admin, "deactivatedAt", "createdAt" FROM "user" WHERE id = $1`,
        [targetId]
      );
      if (targetResult.rows.length === 0) {
        await client.query("ROLLBACK");
        throw new UserNotFoundError(targetId);
      }
      const target = targetResult.rows[0];

      // 3. Idempotent no-op: already deactivated.
      if (target.deactivatedAt !== null) {
        await client.query("COMMIT");
        return mapUserRow(target);
      }

      // 4. Last-admin guard: target is an active admin and the locked set
      //    (which includes the target, since it is still an active admin at
      //    this point) has at most one row.
      if (target.admin && activeAdmins.rows.length <= 1) {
        await client.query("ROLLBACK");
        throw new LastAdminError();
      }

      // 5. Deactivate + revoke sessions.
      const updateResult = await client.query<UserRow>(
        `UPDATE "user" SET "deactivatedAt" = now(), "updatedAt" = now()
         WHERE id = $1 AND "deactivatedAt" IS NULL
         RETURNING id, email, name, admin, "deactivatedAt", "createdAt"`,
        [targetId]
      );

      await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [targetId]);

      await client.query("COMMIT");

      return mapUserRow(updateResult.rows[0]);
    } catch (err) {
      // Ensure we roll back on any unexpected error inside the transaction
      // (the explicit ROLLBACK calls above handle known error paths).
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors -- the original error is more important
      }
      throw err;
    }
  } finally {
    client.release();
  }
}

/**
 * Reactivates a target account, clearing `deactivatedAt`. No session change
 * (FR-006) — a reactivated user simply signs in normally again.
 *
 * Idempotent: reactivating an already-active account is a no-op that
 * returns the current (Active) row.
 *
 * Spec: specs/006-user-account-management/spec.md §US2, §FR-006
 * Plan: data-model.md §Store operations (reactivateAccount)
 */
export async function reactivateAccount(pool: Pool, targetId: string): Promise<AccountSummary> {
  const client = await pool.connect();
  try {
    const targetResult = await client.query<UserRow>(
      `SELECT id, email, name, admin, "deactivatedAt", "createdAt" FROM "user" WHERE id = $1`,
      [targetId]
    );
    if (targetResult.rows.length === 0) {
      throw new UserNotFoundError(targetId);
    }

    const updateResult = await client.query<UserRow>(
      `UPDATE "user" SET "deactivatedAt" = NULL, "updatedAt" = now()
       WHERE id = $1
       RETURNING id, email, name, admin, "deactivatedAt", "createdAt"`,
      [targetId]
    );

    return mapUserRow(updateResult.rows[0]);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// STUB — changeRole (RED task lessons-from-luke-q8m0.5.8.1)
// ---------------------------------------------------------------------------
//
// The real transactional implementation (last-admin lock on demote, no
// self-guard — self-demotion is permitted while another active admin
// remains, per spec Edge Cases) ships in the GREEN task
// (lessons-from-luke-q8m0.5.8.2), mirroring deactivateAccount/
// reactivateAccount's stub-then-implement precedent above. This stub exists
// only so the module resolves for TypeScript/ESLint (avoiding a compile
// error that would mask the intended assertion-level RED state) — it is
// deliberately wrong, always throwing, so every real assertion in
// userStore.test.ts's `changeRole` suite fails on assertion, not module
// resolution.
//
// Spec: specs/006-user-account-management/spec.md §US3, §FR-003, §FR-004,
//       §FR-012, §FR-013
// Plan: data-model.md §Store operations (changeRole), §Last-admin lock
//       (shared fragment)

/**
 * STUB — not implemented. Always throws regardless of input, so every real
 * assertion in userStore.test.ts's `changeRole` suite fails.
 *
 * @param pool - The auth pg.Pool (unused by the stub).
 * @param targetId - The account whose role is being changed (unused by the stub).
 * @param newRole - The target role, 'admin' or 'standard' (unused by the stub).
 * @returns Never resolves — always rejects.
 */
export async function changeRole(
  pool: Pool,
  targetId: string,
  newRole: AccountRole
): Promise<AccountSummary> {
  void pool;
  void targetId;
  void newRole;
  throw new Error("changeRole: not implemented (RED stub)");
}
