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
