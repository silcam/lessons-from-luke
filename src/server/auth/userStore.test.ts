/**
 * Unit/integration tests for userStore.ts — listAccounts(pool).
 *
 * These tests run against the real test database (lessons-from-luke-test).
 * jestSetupAfterEnv.ts handles cleanup: afterEach deletes non-seeded user
 * rows (sparing the seeded admin and, in the unit suite, the mock admin
 * fixture used by controller tests).
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002, §FR-007
 * Plan: data-model.md §Store operations (listAccounts), §Entity: User Account
 *       (derived Role/Status)
 * Reference: mirrors src/server/auth/invitationStore.test.ts's pattern (real
 *            test DB via getAuthPool(), no mocking of pg)
 */
import { Pool } from "pg";
import crypto from "crypto";
import { listAccounts, type AccountSummary } from "./userStore";
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
