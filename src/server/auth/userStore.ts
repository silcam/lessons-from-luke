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

// ---------------------------------------------------------------------------
// STUB — deactivateAccount / reactivateAccount (RED task lessons-from-luke-q8m0.5.7.1)
// ---------------------------------------------------------------------------
//
// The real transactional implementations (last-admin lock, self-lockout guard,
// idempotent no-op, session revocation) ship in the GREEN task
// (lessons-from-luke-q8m0.5.7.2), mirroring listAccounts' stub-then-implement
// precedent above. These stubs exist only so the module resolves for
// TypeScript/ESLint (avoiding a compile error that would mask the intended
// assertion-level RED state) — they are deliberately wrong, always throwing,
// so every real assertion in userStore.test.ts fails on assertion, not module
// resolution.
//
// Spec: specs/006-user-account-management/spec.md §US2, §FR-005..FR-008, §FR-012
// Plan: data-model.md §Store operations (deactivateAccount, reactivateAccount),
//       §Last-admin lock (shared fragment)

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
 * STUB — not implemented. Always throws regardless of input, so every real
 * assertion in userStore.test.ts's `deactivateAccount` suite fails.
 *
 * @param pool - The auth pg.Pool (unused by the stub).
 * @param actingUserId - The administrator performing the deactivation (unused by the stub).
 * @param targetId - The account being deactivated (unused by the stub).
 * @returns Never resolves — always rejects.
 */
export async function deactivateAccount(
  pool: Pool,
  actingUserId: string,
  targetId: string
): Promise<AccountSummary> {
  void pool;
  void actingUserId;
  void targetId;
  throw new Error("deactivateAccount: not implemented (RED stub)");
}

/**
 * STUB — not implemented. Always throws regardless of input, so every real
 * assertion in userStore.test.ts's `reactivateAccount` suite fails.
 *
 * @param pool - The auth pg.Pool (unused by the stub).
 * @param targetId - The account being reactivated (unused by the stub).
 * @returns Never resolves — always rejects.
 */
export async function reactivateAccount(pool: Pool, targetId: string): Promise<AccountSummary> {
  void pool;
  void targetId;
  throw new Error("reactivateAccount: not implemented (RED stub)");
}
