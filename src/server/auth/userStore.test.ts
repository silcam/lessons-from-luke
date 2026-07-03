/**
 * Unit/integration tests for userStore.ts — listAccounts(pool),
 * changeRole(pool, targetId, newRole), deactivateAccount(pool, actingUserId,
 * targetId), reactivateAccount(pool, targetId).
 *
 * These tests run against the real test database (lessons-from-luke-test).
 * jestSetupAfterEnv.ts handles cleanup: afterEach deletes non-seeded user
 * rows (sparing the seeded admin and, in the unit suite, the mock admin
 * fixture used by controller tests) and resets both spared rows to
 * admin=true/deactivatedAt=NULL (data-model.md Decision 5), so a test in this
 * file that demotes or deactivates one of them never leaks into the next.
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §US2, §US3, §FR-001,
 *       §FR-002, §FR-003, §FR-004, §FR-005..FR-008, §FR-012, §FR-013,
 *       §Edge Cases (last-admin under concurrency, self-action,
 *       already-deactivated no-op, no-active-sessions no-op, self-demotion
 *       permitted while another admin remains)
 * Plan: data-model.md §Store operations (listAccounts, changeRole,
 *       deactivateAccount, reactivateAccount), §Last-admin lock (shared
 *       fragment), §State model
 * Reference: mirrors src/server/auth/invitationStore.test.ts's pattern (real
 *            test DB via getAuthPool(), no mocking of pg); the FOR UPDATE lock
 *            is exercised by opening two concurrent client connections (pool
 *            max: 2) and asserting only one of two concurrent
 *            deactivate-the-other-admin (or demote-the-other-admin) calls
 *            succeeds.
 */
import { Pool } from "pg";
import crypto from "crypto";
import {
  listAccounts,
  deactivateAccount,
  reactivateAccount,
  changeRole,
  type AccountSummary,
} from "./userStore";
import { UserNotFoundError, LastAdminError, SelfDeactivationError } from "./userValidation";
import secrets from "../util/secrets";

// ------------------------------------------------------------------
// Pool setup — mirrors invitationStore.test.ts and jestSetupAfterEnv.ts
// ------------------------------------------------------------------

const { username: dbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const pool = new Pool({ ...restTestDb, user: dbUser, max: 2 });

afterAll(async () => {
  await pool.end();
});

// ------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------

const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();

interface InsertUserOptions {
  admin?: boolean;
  deactivatedAt?: Date | null;
  createdAt?: Date;
}

/** Insert a "user" row directly, bypassing better-auth, for store-level tests. */
async function insertTestUser(email: string, opts: InsertUserOptions = {}): Promise<string> {
  const userId = crypto.randomUUID();
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO "user"
         ("id","email","name","admin","emailVerified","deactivatedAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,false,$5,$6,$6)`,
      [
        userId,
        email.toLowerCase(),
        "Test User",
        opts.admin ?? false,
        opts.deactivatedAt ?? null,
        opts.createdAt ?? now,
      ]
    );
  } finally {
    client.release();
  }
  return userId;
}

/** Insert a "session" row directly for a given user, for session-revocation tests. */
async function insertTestSession(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO "session" ("id","userId","token","expiresAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$5)`,
      [id, userId, crypto.randomUUID(), expiresAt, now]
    );
  } finally {
    client.release();
  }
  return id;
}

/** Count the "session" rows belonging to a given user. */
async function countSessions(userId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM "session" WHERE "userId" = $1`,
      [userId]
    );
    return Number(result.rows[0].count);
  } finally {
    client.release();
  }
}

/**
 * Demote every existing admin row (including the seeded admin and, in the
 * unit suite, the mock-admin fixture jestSetupAfterEnv seeds by default) so a
 * test can construct an exact, controlled active-admin count. Safe: both
 * spared rows are reset to admin=true by jestSetupAfterEnv's afterEach
 * (data-model.md Decision 5), so this never leaks into the next test.
 */
async function demoteAllExistingAdmins(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`UPDATE "user" SET admin = false`);
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------
// listAccounts(pool) — FR-001, FR-002, FR-007
// ------------------------------------------------------------------

describe("listAccounts(pool)", () => {
  // ------------------------------------------------------------------
  // 1. Returns all accounts (including a deactivated one) ordered by
  //    createdAt ascending
  // ------------------------------------------------------------------

  it("returns all accounts, including a deactivated one, ordered by createdAt ascending", async () => {
    const olderEmail = "roster-older@example.com";
    const middleEmail = "roster-middle-deactivated@example.com";
    const newerEmail = "roster-newer@example.com";

    const base = Date.now();
    await insertTestUser(newerEmail, { createdAt: new Date(base) });
    await insertTestUser(middleEmail, {
      createdAt: new Date(base - 60_000),
      deactivatedAt: new Date(base - 30_000),
    });
    await insertTestUser(olderEmail, { createdAt: new Date(base - 120_000) });

    const list = await listAccounts(pool);
    const emails = list.map((row) => row.email);

    const olderIdx = emails.indexOf(olderEmail);
    const middleIdx = emails.indexOf(middleEmail);
    const newerIdx = emails.indexOf(newerEmail);

    expect(olderIdx).toBeGreaterThan(-1);
    expect(middleIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeGreaterThan(-1);
    // Ascending createdAt: older before middle before newer.
    expect(olderIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(newerIdx);

    // The deactivated row must still appear in the roster (not filtered out).
    const middleRow = list.find((row) => row.email === middleEmail);
    expect(middleRow).toBeDefined();
  });

  // ------------------------------------------------------------------
  // 2. Each row has derived role: 'admin' | 'standard' from the admin boolean
  // ------------------------------------------------------------------

  it("derives role: 'admin' from admin=true and 'standard' from admin=false", async () => {
    const adminAccountEmail = "roster-role-admin@example.com";
    const standardAccountEmail = "roster-role-standard@example.com";
    await insertTestUser(adminAccountEmail, { admin: true });
    await insertTestUser(standardAccountEmail, { admin: false });

    const list = await listAccounts(pool);

    const adminRow = list.find((row) => row.email === adminAccountEmail);
    const standardRow = list.find((row) => row.email === standardAccountEmail);

    expect(adminRow).toBeDefined();
    expect(adminRow!.role).toBe("admin");
    expect(standardRow).toBeDefined();
    expect(standardRow!.role).toBe("standard");
  });

  // ------------------------------------------------------------------
  // 3. Each row has derived status: 'active' | 'deactivated' from
  //    deactivatedAt (NULL -> active)
  // ------------------------------------------------------------------

  it("derives status: 'active' when deactivatedAt is NULL, 'deactivated' otherwise", async () => {
    const activeEmail = "roster-status-active@example.com";
    const deactivatedEmail = "roster-status-deactivated@example.com";
    await insertTestUser(activeEmail, { deactivatedAt: null });
    await insertTestUser(deactivatedEmail, { deactivatedAt: new Date() });

    const list = await listAccounts(pool);

    const activeRow = list.find((row) => row.email === activeEmail);
    const deactivatedRow = list.find((row) => row.email === deactivatedEmail);

    expect(activeRow).toBeDefined();
    expect(activeRow!.status).toBe("active");
    expect(deactivatedRow).toBeDefined();
    expect(deactivatedRow!.status).toBe("deactivated");
  });

  // ------------------------------------------------------------------
  // 4. Row shape never includes password or session tokens — only the
  //    AccountSummary fields: id, email, name, role, status, createdAt
  // ------------------------------------------------------------------

  it("never includes password or session-token fields (only AccountSummary fields)", async () => {
    const email = "roster-shape@example.com";
    await insertTestUser(email);

    const list = await listAccounts(pool);
    const row = list.find((r) => r.email === email);
    expect(row).toBeDefined();

    const keys = Object.keys(row as AccountSummary).sort();
    expect(keys).toEqual(["createdAt", "email", "id", "name", "role", "status"].sort());

    const unsafeRow = row as unknown as Record<string, unknown>;
    expect(unsafeRow.password).toBeUndefined();
    expect(unsafeRow.sessionToken).toBeUndefined();
    expect(unsafeRow.token).toBeUndefined();
    expect(unsafeRow.isSelf).toBeUndefined();

    expect(typeof row!.id).toBe("string");
    expect(typeof row!.name).toBe("string");
    expect(row!.createdAt).toBeInstanceOf(Date);
  });

  // ------------------------------------------------------------------
  // 5. Roster with only the seeded admin (single row) works (spec Edge
  //    Case: empty/single-account roster)
  // ------------------------------------------------------------------

  it("returns a single row for a roster reduced to only the seeded admin (empty/single-account edge case)", async () => {
    // Reduce the roster to just the seeded admin. jestSetupAfterEnv's
    // beforeEach seeds an extra "Mock Admin" fixture row (unit suite only,
    // for controller tests) — deleting every non-seeded-admin row here is
    // safe: the next test's beforeEach re-inserts the mock row via
    // ON CONFLICT DO NOTHING, and this test's own afterEach re-normalizes
    // the seeded admin regardless.
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM "user" WHERE LOWER(email) != $1`, [adminEmail]);
    } finally {
      client.release();
    }

    const list = await listAccounts(pool);
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe(adminEmail);
    expect(list[0].role).toBe("admin");
    expect(list[0].status).toBe("active");
  });
});

// ------------------------------------------------------------------
// changeRole(pool, targetId, newRole) — FR-003, FR-004, FR-012, FR-013
// ------------------------------------------------------------------

describe("changeRole(pool, targetId, newRole)", () => {
  // ------------------------------------------------------------------
  // 1. Promote a Standard user to Admin
  // ------------------------------------------------------------------

  it("promotes a Standard user to Admin", async () => {
    const targetId = await insertTestUser("promote-target@example.com", { admin: false });

    const result = await changeRole(pool, targetId, "admin");

    expect(result.id).toBe(targetId);
    expect(result.role).toBe("admin");
  });

  // ------------------------------------------------------------------
  // 2. Demote an Admin to Standard when another active admin remains
  // ------------------------------------------------------------------

  it("demotes an Admin to Standard when another active admin remains", async () => {
    await demoteAllExistingAdmins();
    await insertTestUser("demote-other-admin@example.com", { admin: true });
    const targetId = await insertTestUser("demote-target@example.com", { admin: true });

    const result = await changeRole(pool, targetId, "standard");

    expect(result.id).toBe(targetId);
    expect(result.role).toBe("standard");
  });

  // ------------------------------------------------------------------
  // 3. Last-admin: demoting the only remaining active admin -> LastAdminError,
  //    no change made
  // ------------------------------------------------------------------

  it("throws LastAdminError and makes no change when demoting the only remaining active admin", async () => {
    await demoteAllExistingAdmins();
    const targetId = await insertTestUser("last-admin-role-target@example.com", { admin: true });

    await expect(changeRole(pool, targetId, "standard")).rejects.toThrow(LastAdminError);

    const list = await listAccounts(pool);
    const row = list.find((r) => r.id === targetId);
    expect(row).toBeDefined();
    expect(row!.role).toBe("admin");
  });

  // ------------------------------------------------------------------
  // 4. Self-demotion is permitted while another active admin remains — no
  //    self-guard on role change (the one asymmetry vs. deactivate, per spec
  //    Edge Cases)
  // ------------------------------------------------------------------

  it("permits an admin to demote themselves while another active admin remains (no self-guard on role change)", async () => {
    await demoteAllExistingAdmins();
    await insertTestUser("self-demote-other-admin@example.com", { admin: true });
    const selfId = await insertTestUser("self-demote-self@example.com", { admin: true });

    const result = await changeRole(pool, selfId, "standard");

    expect(result.id).toBe(selfId);
    expect(result.role).toBe("standard");
  });

  // ------------------------------------------------------------------
  // 5. Target not found -> UserNotFoundError
  // ------------------------------------------------------------------

  it("throws UserNotFoundError when the target id does not exist", async () => {
    const missingId = crypto.randomUUID();

    await expect(changeRole(pool, missingId, "standard")).rejects.toThrow(UserNotFoundError);
  });

  // ------------------------------------------------------------------
  // 6. Concurrency (spec Edge Case): two active admins A and B, two
  //    concurrent demote-the-other-admin role changes must not both
  //    succeed — at least one is refused with LastAdminError, and the
  //    system never reaches zero admins.
  // ------------------------------------------------------------------

  it("under concurrency, exactly one of two mutual demote-the-other-admin role changes succeeds and the other is refused with LastAdminError", async () => {
    await demoteAllExistingAdmins();
    const adminAId = await insertTestUser("concurrent-role-admin-a@example.com", { admin: true });
    const adminBId = await insertTestUser("concurrent-role-admin-b@example.com", { admin: true });

    // A's role change targets B (demote); B's role change targets A
    // (demote), concurrently. The shared FOR UPDATE lock (data-model.md
    // §Last-admin lock) serializes these against the same active-admin row
    // set, so exactly one must win.
    const settled = await Promise.allSettled([
      changeRole(pool, adminBId, "standard"),
      changeRole(pool, adminAId, "standard"),
    ]);

    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<AccountSummary> => r.status === "fulfilled"
    );
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(LastAdminError);

    // Never zero admins: at least one of A/B remains an active admin.
    const list = await listAccounts(pool);
    const activeAdmins = list.filter((r) => r.role === "admin" && r.status === "active");
    expect(activeAdmins.length).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------------
// deactivateAccount(pool, actingUserId, targetId) — FR-005, FR-007, FR-008, FR-012
// ------------------------------------------------------------------

describe("deactivateAccount(pool, actingUserId, targetId)", () => {
  // ------------------------------------------------------------------
  // 1. Sets deactivatedAt and DELETEs the target's sessions, in one
  //    transaction, on a Standard user target
  // ------------------------------------------------------------------

  it("deactivates a Standard user and deletes their sessions in one transaction", async () => {
    const targetId = await insertTestUser("deactivate-target@example.com", { admin: false });
    await insertTestSession(targetId);
    await insertTestSession(targetId);
    const actingUserId = crypto.randomUUID();

    const result = await deactivateAccount(pool, actingUserId, targetId);

    expect(result.id).toBe(targetId);
    expect(result.status).toBe("deactivated");

    const sessionCount = await countSessions(targetId);
    expect(sessionCount).toBe(0);
  });

  // ------------------------------------------------------------------
  // 2. Self-lockout: targetId === actingUserId -> SelfDeactivationError, no change
  // ------------------------------------------------------------------

  it("throws SelfDeactivationError and makes no change when targetId === actingUserId", async () => {
    const selfId = await insertTestUser("self-lockout@example.com", { admin: true });

    await expect(deactivateAccount(pool, selfId, selfId)).rejects.toThrow(SelfDeactivationError);

    const list = await listAccounts(pool);
    const row = list.find((r) => r.id === selfId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("active");
  });

  // ------------------------------------------------------------------
  // 3. Last-admin: target is the only active admin -> LastAdminError, no change
  // ------------------------------------------------------------------

  it("throws LastAdminError and makes no change when the target is the only remaining active admin", async () => {
    // Reduce the roster to a single active admin (the target) by demoting the
    // admins jestSetupAfterEnv seeds by default (see data-model.md Decision 5).
    await demoteAllExistingAdmins();
    const targetId = await insertTestUser("last-admin-target@example.com", { admin: true });
    const actingUserId = crypto.randomUUID();

    await expect(deactivateAccount(pool, actingUserId, targetId)).rejects.toThrow(LastAdminError);

    const list = await listAccounts(pool);
    const row = list.find((r) => r.id === targetId);
    expect(row).toBeDefined();
    expect(row!.status).toBe("active");
  });

  // ------------------------------------------------------------------
  // 4. Idempotent no-op: deactivating an already-deactivated account
  //    returns the current (Deactivated) row without error
  // ------------------------------------------------------------------

  it("is idempotent: deactivating an already-deactivated account is a no-op returning the current Deactivated row", async () => {
    const targetId = await insertTestUser("already-deactivated@example.com", {
      admin: false,
      deactivatedAt: new Date(),
    });
    const actingUserId = crypto.randomUUID();

    const result = await deactivateAccount(pool, actingUserId, targetId);

    expect(result.id).toBe(targetId);
    expect(result.status).toBe("deactivated");
  });

  // ------------------------------------------------------------------
  // 5. Target not found -> UserNotFoundError
  // ------------------------------------------------------------------

  it("throws UserNotFoundError when the target id does not exist", async () => {
    const actingUserId = crypto.randomUUID();
    const missingId = crypto.randomUUID();

    await expect(deactivateAccount(pool, actingUserId, missingId)).rejects.toThrow(
      UserNotFoundError
    );
  });

  // ------------------------------------------------------------------
  // 9. Deactivate a user with zero active sessions succeeds without error
  //    (nothing to revoke)
  // ------------------------------------------------------------------

  it("deactivates a user with zero active sessions without error (nothing to revoke)", async () => {
    const targetId = await insertTestUser("no-sessions@example.com", { admin: false });
    const actingUserId = crypto.randomUUID();

    const result = await deactivateAccount(pool, actingUserId, targetId);

    expect(result.id).toBe(targetId);
    expect(result.status).toBe("deactivated");
    expect(await countSessions(targetId)).toBe(0);
  });

  // ------------------------------------------------------------------
  // 10. Concurrency (spec Edge Case): two active admins A and B, two
  //     concurrent deactivateAccount calls each targeting the OTHER admin
  //     must not both succeed — at least one is refused with LastAdminError,
  //     and the system never reaches zero admins.
  // ------------------------------------------------------------------

  it("under concurrency, exactly one of two mutual deactivate-the-other-admin calls succeeds and the other is refused with LastAdminError", async () => {
    // Reduce the roster to exactly two active admins: A and B.
    await demoteAllExistingAdmins();
    const adminAId = await insertTestUser("concurrent-admin-a@example.com", { admin: true });
    const adminBId = await insertTestUser("concurrent-admin-b@example.com", { admin: true });

    // A attempts to deactivate B; B attempts to deactivate A, concurrently.
    // The shared FOR UPDATE lock (data-model.md §Last-admin lock) serializes
    // these against the same active-admin row set, so exactly one must win.
    const settled = await Promise.allSettled([
      deactivateAccount(pool, adminAId, adminBId),
      deactivateAccount(pool, adminBId, adminAId),
    ]);

    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<AccountSummary> => r.status === "fulfilled"
    );
    const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(LastAdminError);

    // Never zero admins: at least one of A/B remains an active admin.
    const list = await listAccounts(pool);
    const activeAdmins = list.filter((r) => r.role === "admin" && r.status === "active");
    expect(activeAdmins.length).toBeGreaterThanOrEqual(1);
  });
});

// ------------------------------------------------------------------
// reactivateAccount(pool, targetId) — FR-006
// ------------------------------------------------------------------

describe("reactivateAccount(pool, targetId)", () => {
  // ------------------------------------------------------------------
  // 6. Sets deactivatedAt = NULL
  // ------------------------------------------------------------------

  it("reactivates a deactivated account, clearing deactivatedAt", async () => {
    const targetId = await insertTestUser("reactivate-target@example.com", {
      admin: false,
      deactivatedAt: new Date(),
    });

    const result = await reactivateAccount(pool, targetId);

    expect(result.id).toBe(targetId);
    expect(result.status).toBe("active");
  });

  // ------------------------------------------------------------------
  // 7. Idempotent no-op: reactivating an already-active account returns
  //    the current (Active) row without error
  // ------------------------------------------------------------------

  it("is idempotent: reactivating an already-active account is a no-op returning the current Active row", async () => {
    const targetId = await insertTestUser("already-active@example.com", { admin: false });

    const result = await reactivateAccount(pool, targetId);

    expect(result.id).toBe(targetId);
    expect(result.status).toBe("active");
  });

  // ------------------------------------------------------------------
  // 8. Reactivate on not-found target -> UserNotFoundError
  // ------------------------------------------------------------------

  it("throws UserNotFoundError when reactivating a non-existent target", async () => {
    const missingId = crypto.randomUUID();

    await expect(reactivateAccount(pool, missingId)).rejects.toThrow(UserNotFoundError);
  });
});
