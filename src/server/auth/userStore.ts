/**
 * userStore.ts — STUB for the RED task (lessons-from-luke-q8m0.5.6.1).
 *
 * The real implementation ships in the GREEN task
 * (lessons-from-luke-q8m0.5.6.2), mirroring src/server/auth/invitationStore.ts.
 * This stub exists only so the module resolves for TypeScript/ESLint (avoiding
 * a compile error that would mask the intended assertion-level RED state).
 * `listAccounts` is deliberately wrong — it always returns an empty array — so
 * userStore.test.ts fails on assertion, not on module resolution.
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

/**
 * STUB — not implemented. Always returns an empty array regardless of the
 * roster's real contents, so every real assertion in userStore.test.ts fails.
 *
 * @param pool - The auth pg.Pool (unused by the stub).
 * @returns Always `[]`.
 */
export async function listAccounts(pool: Pool): Promise<AccountSummary[]> {
  void pool;
  return [];
}
