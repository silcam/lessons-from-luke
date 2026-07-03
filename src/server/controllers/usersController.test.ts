/**
 * Controller tests for GET /api/admin/users (US1) and POST
 * /api/admin/users/:id/deactivate, /reactivate (US2).
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §US2, §FR-001,
 *       §FR-002, §FR-005..FR-008, §FR-010, §FR-011
 * Plan: contracts/user-admin-api.yaml paths./api/admin/users.get,
 *       ./api/admin/users/{id}/deactivate, ./{id}/reactivate; plan.md
 *       §Edge Cases & Error Handling ("No-op guard refusals stay
 *       non-confusing", "Unexpected server / DB failures")
 *
 * These tests use the real test database via loggedInAgent() / plainAgent() from
 * testHelper.ts, consistent with existing controller tests (mirrors
 * invitationController.test.ts's admin-list-route and retract-route tests —
 * requireSameOrigin, 409 error-code responses). requireAdmin is already
 * mounted at app.use("/api/admin", requireAdmin) in serverApp.ts, so the
 * 401/403 assertions below exercise real middleware even before
 * usersController's routes exist.
 *
 * RED: usersController.ts does not mount POST /api/admin/users/:id/deactivate
 * or /reactivate yet, so every request below falls through past requireAdmin
 * (and requireSameOrigin, where relevant) to Express's default 404 handler —
 * every non-404-expecting assertion fails (actual 404). The GET /users tests
 * above are unaffected (US1 is already GREEN).
 */

/// <reference types="jest" />

import { Request } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import { plainAgent, loggedInAgent } from "../testHelper";
import secrets from "../util/secrets";
import { getAdminId } from "./usersController";

// ---------------------------------------------------------------------------
// Auth pool for inserting test users directly (sign-up is disabled globally).
// Mirrors the pattern in invitationController.test.ts.
// ---------------------------------------------------------------------------

const { username: dbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const authPool = new Pool({ ...restTestDb, user: dbUser, max: 2 });

afterAll(async () => {
  await authPool.end();
});

/**
 * Insert a non-admin user directly into the auth tables (bypasses disabled
 * sign-up). Returns the agent signed in as that user. Mirrors
 * invitationController.test.ts's nonAdminAgent().
 */
async function nonAdminAgent() {
  const email = `nonadmin-users-ctrl-test-${crypto.randomUUID()}@example.com`;
  const password = "TestPassword1!";
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = new Date();

  const { hash: argon2idHash } =
    require("../auth/passwordHasher") as typeof import("../auth/passwordHasher");
  const passwordHash = await argon2idHash(password);

  const client = await authPool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,$2,'NonAdmin',false,false,$3,$3)`,
      [userId, email.toLowerCase(), now]
    );
    await client.query(
      `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
       VALUES ($1,$2,$2,'credential',$3,$4,$4)`,
      [accountId, userId, passwordHash, now]
    );
  } finally {
    client.release();
  }

  const agent = plainAgent();
  await agent.post("/api/auth/sign-in/email").send({ email, password });
  return agent;
}

/** Insert a plain "user" row directly, bypassing better-auth. */
async function insertUserRow(
  email: string,
  opts: { admin?: boolean; deactivatedAt?: Date | null } = {}
): Promise<string> {
  const userId = crypto.randomUUID();
  const now = new Date();
  const client = await authPool.connect();
  try {
    await client.query(
      `INSERT INTO "user"
         ("id","email","name","admin","emailVerified","deactivatedAt","createdAt","updatedAt")
       VALUES ($1,$2,'Roster Test User',$3,false,$4,$5,$5)`,
      [userId, email.toLowerCase(), opts.admin ?? false, opts.deactivatedAt ?? null, now]
    );
  } finally {
    client.release();
  }
  return userId;
}

/**
 * Reads the raw `admin`/`deactivatedAt` columns for a user row directly
 * (bypassing the API), so tests can assert a row is genuinely unchanged
 * after a refused or failed mutation.
 */
async function fetchRawUserRow(
  id: string
): Promise<{ admin: boolean; deactivatedAt: Date | null } | null> {
  const client = await authPool.connect();
  try {
    const result = await client.query<{ admin: boolean; deactivatedAt: Date | null }>(
      `SELECT admin, "deactivatedAt" FROM "user" WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

/**
 * Insert a "session" row directly for a given user, for revoke-sessions
 * route tests. Mirrors userStore.test.ts's insertTestSession() helper.
 */
async function insertTestSession(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const client = await authPool.connect();
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
  const client = await authPool.connect();
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

// ---------------------------------------------------------------------------
// GET /api/admin/users — the account roster (US1, FR-001, FR-002, FR-010)
// ---------------------------------------------------------------------------

describe("GET /api/admin/users", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — admin agent gets array of UserAccountRow; isSelf true on own
  //    row, false on others (FR-002)
  // -------------------------------------------------------------------------
  it("200: admin gets an array of UserAccountRow with isSelf true on own row, false on others", async () => {
    const agent = await loggedInAgent();
    const otherEmail = `roster-other-${crypto.randomUUID()}@example.com`;
    await insertUserRow(otherEmail);

    const res = await agent.get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const rows = res.body as Array<Record<string, unknown>>;
    // The unit-suite better-auth shim always signs the admin in with
    // id "user-test-id" (the mock-admin row seeded in jestSetupAfterEnv.ts).
    const selfRow = rows.find((row) => row.id === "user-test-id");
    expect(selfRow).toBeDefined();
    expect(selfRow!.isSelf).toBe(true);

    const otherRow = rows.find((row) => row.email === otherEmail);
    expect(otherRow).toBeDefined();
    expect(otherRow!.isSelf).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. Response has Cache-Control: no-store (PII surface, mirrors GET
  //    /api/admin/invitations)
  // -------------------------------------------------------------------------
  it("has Cache-Control: no-store header", async () => {
    const agent = await loggedInAgent();

    const res = await agent.get("/api/admin/users");

    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 3. 401 — unauthenticated request
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();

    const res = await agent.get("/api/admin/users");

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 4. 403 — signed-in non-admin (Standard user)
  // -------------------------------------------------------------------------
  it("403: signed-in non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();

    const res = await agent.get("/api/admin/users");

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 5. Deactivated account still appears in the list (not filtered out)
  // -------------------------------------------------------------------------
  it("includes a deactivated account in the roster (not filtered out)", async () => {
    const agent = await loggedInAgent();
    const deactivatedEmail = `roster-deactivated-${crypto.randomUUID()}@example.com`;
    await insertUserRow(deactivatedEmail, { deactivatedAt: new Date() });

    const res = await agent.get("/api/admin/users");

    expect(res.status).toBe(200);
    const rows = res.body as Array<Record<string, unknown>>;
    const row = rows.find((r) => r.email === deactivatedEmail);
    expect(row).toBeDefined();
    expect(row!.status).toBe("deactivated");
  });

  // -------------------------------------------------------------------------
  // 6. 500 — a simulated listAccounts failure calls next(err), handing off
  //    to Express's error-handling middleware (unexpected-error branch,
  //    lines 71-72).
  // -------------------------------------------------------------------------
  it("500: a simulated listAccounts failure calls next(err)", async () => {
    const agent = await loggedInAgent();

    const userStore = require("../auth/userStore") as typeof import("../auth/userStore");
    const spy = jest
      .spyOn(userStore, "listAccounts")
      .mockRejectedValueOnce(new Error("simulated DB failure"));

    try {
      const res = await agent.get("/api/admin/users");

      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/deactivate — deactivate an account (US2, FR-005,
// FR-007, FR-008, FR-010, FR-011)
// ---------------------------------------------------------------------------

describe("POST /api/admin/users/:id/deactivate", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — admin deactivates a Standard user, updated row with
  //    status: 'deactivated'
  // -------------------------------------------------------------------------
  it("200: admin deactivates a Standard user, returning the updated row with status 'deactivated'", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `deactivate-standard-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const res = await agent.post(`/api/admin/users/${targetId}/deactivate`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, status: "deactivated" });

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.deactivatedAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // 2. 409 — admin attempts to deactivate their own account (self-lockout),
  //    row unchanged
  // -------------------------------------------------------------------------
  it("409: deactivating your own account is rejected with SELF_DEACTIVATION, row unchanged", async () => {
    const agent = await loggedInAgent();
    // The unit-suite better-auth shim always signs the admin in with id
    // "user-test-id" (the mock-admin row seeded in jestSetupAfterEnv.ts).
    const selfId = "user-test-id";

    const res = await agent.post(`/api/admin/users/${selfId}/deactivate`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "SELF_DEACTIVATION" });

    const row = await fetchRawUserRow(selfId);
    expect(row).not.toBeNull();
    expect(row!.deactivatedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. 409 — admin attempts to deactivate the last remaining active admin,
  //    row unchanged
  // -------------------------------------------------------------------------
  it("409: deactivating the last remaining active admin is rejected with LAST_ADMIN, row unchanged", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `last-admin-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: true });

    // Demote every OTHER admin (the seeded admin and the mock-admin session's
    // own row) so the newly-inserted target is the only remaining active
    // admin. Both spared rows are reset to admin=true by jestSetupAfterEnv's
    // afterEach (data-model.md Decision 5), so this never leaks into the next
    // test — mirrors userStore.test.ts's demoteAllExistingAdmins() helper.
    const client = await authPool.connect();
    try {
      await client.query(`UPDATE "user" SET admin = false WHERE id != $1`, [targetId]);
    } finally {
      client.release();
    }

    const res = await agent.post(`/api/admin/users/${targetId}/deactivate`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "LAST_ADMIN" });

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.deactivatedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. 200 — deactivating an already-deactivated account is an idempotent
  //    no-op, NOT a 4xx (plan.md "No-op guard refusals stay non-confusing")
  // -------------------------------------------------------------------------
  it("200: deactivating an already-deactivated account is an idempotent no-op (not a 4xx)", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `already-deactivated-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false, deactivatedAt: new Date() });

    const res = await agent.post(`/api/admin/users/${targetId}/deactivate`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, status: "deactivated" });
  });

  // -------------------------------------------------------------------------
  // 5. 404 — deactivate on a nonexistent id
  // -------------------------------------------------------------------------
  it("404: deactivating a nonexistent id returns USER_NOT_FOUND", async () => {
    const agent = await loggedInAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/deactivate`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "USER_NOT_FOUND" });
  });

  // -------------------------------------------------------------------------
  // 6. 403 — missing/foreign same-origin header (requireSameOrigin CSRF
  //    defense), mirrors invitationController.test.ts's retract-route tests
  // -------------------------------------------------------------------------
  it("403: admin session with foreign Origin is rejected (requireSameOrigin CSRF defense)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = await loggedInAgent();
      const targetEmail = `origin-check-${crypto.randomUUID()}@example.com`;
      const targetId = await insertUserRow(targetEmail, { admin: false });

      const res = await agent
        .post(`/api/admin/users/${targetId}/deactivate`)
        .set("Origin", "https://attacker.example.com");

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 7a. 401 — unauthenticated request
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/deactivate`);

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 7b. 403 — signed-in non-admin (Standard user)
  // -------------------------------------------------------------------------
  it("403: signed-in non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/deactivate`);

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 10. 500 — a simulated DB failure mid-transaction returns a generic body
  //     (no SQL/stack/driver text), and the row is verifiably unchanged
  //     afterward (no partial mutation). Mirrors invitationController's
  //     error handling (plan.md "Unexpected server / DB failures"): any
  //     error inside the guarded transaction MUST ROLLBACK, and the response
  //     body MUST NOT leak SQL, stack, or driver text.
  // -------------------------------------------------------------------------
  it("500: a simulated DB failure returns a generic body and leaves the row unchanged (no partial mutation)", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `db-failure-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const userStore = require("../auth/userStore") as typeof import("../auth/userStore");
    const spy = jest
      .spyOn(userStore, "deactivateAccount")
      .mockRejectedValueOnce(
        new Error(
          'update "user" set "deactivatedAt" = now() where id = $1 -- Connection terminated unexpectedly' +
            " at Client._handleErrorEvent (/app/node_modules/pg/lib/client.js:315:19)"
        )
      );

    try {
      const res = await agent.post(`/api/admin/users/${targetId}/deactivate`);

      expect(res.status).toBe(500);
      const bodyText = JSON.stringify(res.body).toLowerCase();
      expect(bodyText).not.toMatch(
        /select|update|delete|"user"|deactivatedat|pg\/lib|node_modules|client\.js|constraint/
      );
    } finally {
      spy.mockRestore();
    }

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.deactivatedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/reactivate — reactivate a deactivated account
// (US2, FR-006)
// ---------------------------------------------------------------------------

describe("POST /api/admin/users/:id/reactivate", () => {
  // -------------------------------------------------------------------------
  // 8. 200 — reactivate a deactivated account, status: 'active'
  // -------------------------------------------------------------------------
  it("200: admin reactivates a deactivated account, returning the updated row with status 'active'", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `reactivate-target-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, {
      admin: false,
      deactivatedAt: new Date(),
    });

    const res = await agent.post(`/api/admin/users/${targetId}/reactivate`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, status: "active" });

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.deactivatedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 9. 200 — reactivating an already-active account is an idempotent no-op
  // -------------------------------------------------------------------------
  it("200: reactivating an already-active account is an idempotent no-op (not a 4xx)", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `already-active-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const res = await agent.post(`/api/admin/users/${targetId}/reactivate`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, status: "active" });
  });

  // -------------------------------------------------------------------------
  // 9b. 404 — reactivate on a nonexistent id
  // -------------------------------------------------------------------------
  it("404: reactivating a nonexistent id returns USER_NOT_FOUND", async () => {
    const agent = await loggedInAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/reactivate`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "USER_NOT_FOUND" });
  });

  // -------------------------------------------------------------------------
  // 10. 500 — a simulated DB failure returns a generic body (no SQL/stack/
  //     driver text). Mirrors the deactivate-route 500 test (unexpected-
  //     error branch, lines 167-173).
  // -------------------------------------------------------------------------
  it("500: a simulated DB failure returns a generic body", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `reactivate-db-failure-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false, deactivatedAt: new Date() });

    const userStore = require("../auth/userStore") as typeof import("../auth/userStore");
    const spy = jest
      .spyOn(userStore, "reactivateAccount")
      .mockRejectedValueOnce(
        new Error(
          'update "user" set "deactivatedAt" = null where id = $1 -- Connection terminated unexpectedly' +
            " at Client._handleErrorEvent (/app/node_modules/pg/lib/client.js:315:19)"
        )
      );

    try {
      const res = await agent.post(`/api/admin/users/${targetId}/reactivate`);

      expect(res.status).toBe(500);
      const bodyText = JSON.stringify(res.body).toLowerCase();
      expect(bodyText).not.toMatch(
        /select|update|delete|"user"|deactivatedat|pg\/lib|node_modules|client\.js|constraint/
      );
      expect(res.body).toMatchObject({ error: "An unexpected error occurred" });
    } finally {
      spy.mockRestore();
    }

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.deactivatedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/role — promote/demote an account (US3, FR-003,
// FR-004, FR-010, FR-011)
//
// RED: usersController.ts does not mount POST /api/admin/users/:id/role yet,
// so requests that reach past requireAdmin fall through to Express's default
// 404 handler — every non-404-expecting assertion below fails (actual 404).
// ---------------------------------------------------------------------------

describe("POST /api/admin/users/:id/role", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — promote a Standard user to Admin
  // -------------------------------------------------------------------------
  it("200: promotes a Standard user to Admin", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `promote-standard-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const res = await agent.post(`/api/admin/users/${targetId}/role`).send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, role: "admin" });
  });

  // -------------------------------------------------------------------------
  // 2. 200 — demote an Admin to Standard when another admin exists
  // -------------------------------------------------------------------------
  it("200: demotes an Admin to Standard when another admin exists", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `demote-admin-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: true });

    const res = await agent.post(`/api/admin/users/${targetId}/role`).send({ role: "standard" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, role: "standard" });
  });

  // -------------------------------------------------------------------------
  // 3. 409 — demoting the last remaining active admin is refused, row
  //    unchanged (mirrors the deactivate-route LAST_ADMIN test)
  // -------------------------------------------------------------------------
  it("409: demoting the last remaining admin is rejected with LAST_ADMIN, row unchanged", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `last-admin-role-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: true });

    // Demote every OTHER admin (the seeded admin and the mock-admin session's
    // own row) so the newly-inserted target is the only remaining active
    // admin. Both spared rows are reset to admin=true by jestSetupAfterEnv's
    // afterEach (data-model.md Decision 5), so this never leaks into the next
    // test.
    const client = await authPool.connect();
    try {
      await client.query(`UPDATE "user" SET admin = false WHERE id != $1`, [targetId]);
    } finally {
      client.release();
    }

    const res = await agent.post(`/api/admin/users/${targetId}/role`).send({ role: "standard" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "LAST_ADMIN" });

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.admin).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4a. 400 — an invalid role value is rejected
  // -------------------------------------------------------------------------
  it("400: rejects an invalid role value", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `invalid-role-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const res = await agent.post(`/api/admin/users/${targetId}/role`).send({ role: "bogus" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "INVALID_ROLE" });
  });

  // -------------------------------------------------------------------------
  // 4b. 400 — a missing role value is rejected
  // -------------------------------------------------------------------------
  it("400: rejects a missing role value", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `missing-role-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const res = await agent.post(`/api/admin/users/${targetId}/role`).send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "INVALID_ROLE" });
  });

  // -------------------------------------------------------------------------
  // 5. 404 — role change on a nonexistent id
  // -------------------------------------------------------------------------
  it("404: changing the role of a nonexistent id returns USER_NOT_FOUND", async () => {
    const agent = await loggedInAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/role`).send({ role: "admin" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "USER_NOT_FOUND" });
  });

  // -------------------------------------------------------------------------
  // 6. 403 — missing/foreign same-origin header (requireSameOrigin CSRF
  //    defense), mirrors the deactivate-route origin-check test
  // -------------------------------------------------------------------------
  it("403: admin session with foreign Origin is rejected (requireSameOrigin CSRF defense)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = await loggedInAgent();
      const targetEmail = `origin-check-role-${crypto.randomUUID()}@example.com`;
      const targetId = await insertUserRow(targetEmail, { admin: false });

      const res = await agent
        .post(`/api/admin/users/${targetId}/role`)
        .set("Origin", "https://attacker.example.com")
        .send({ role: "admin" });

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 7a. 401 — unauthenticated request
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/role`).send({ role: "admin" });

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 7b. 403 — signed-in non-admin (Standard user)
  // -------------------------------------------------------------------------
  it("403: signed-in non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/role`).send({ role: "admin" });

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 8. 200 — an admin demoting THEMSELVES (with another admin present)
  //    succeeds and the response row has isSelf: true
  // -------------------------------------------------------------------------
  it("200: an admin demoting themselves succeeds with isSelf: true on the response row", async () => {
    const agent = await loggedInAgent();
    // The unit-suite better-auth shim always signs the admin in with id
    // "user-test-id" (the mock-admin row seeded in jestSetupAfterEnv.ts); the
    // seeded admin remains active, so this demotion is permitted (no
    // self-guard on role change, unlike deactivate — spec Edge Cases).
    const selfId = "user-test-id";

    const res = await agent.post(`/api/admin/users/${selfId}/role`).send({ role: "standard" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: selfId, role: "standard", isSelf: true });
  });

  // -------------------------------------------------------------------------
  // 9. 500 — parseAccountRole throwing something other than InvalidRoleError
  //    returns a generic body (unexpected-error branch, lines 211-212).
  // -------------------------------------------------------------------------
  it("500: an unexpected parseAccountRole failure returns a generic body", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `role-parse-failure-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const userValidation =
      require("../auth/userValidation") as typeof import("../auth/userValidation");
    const spy = jest.spyOn(userValidation, "parseAccountRole").mockImplementationOnce(() => {
      throw new Error("simulated unexpected parse failure");
    });

    try {
      const res = await agent.post(`/api/admin/users/${targetId}/role`).send({ role: "admin" });

      expect(res.status).toBe(500);
      expect(res.body).toMatchObject({ error: "An unexpected error occurred" });
    } finally {
      spy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // 10. 500 — a simulated changeRole DB failure returns a generic body
  //     (unexpected-error branch, lines 235-236).
  // -------------------------------------------------------------------------
  it("500: a simulated changeRole DB failure returns a generic body", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `role-db-failure-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const userStore = require("../auth/userStore") as typeof import("../auth/userStore");
    const spy = jest
      .spyOn(userStore, "changeRole")
      .mockRejectedValueOnce(
        new Error(
          'update "user" set "admin" = true where id = $1 -- Connection terminated unexpectedly' +
            " at Client._handleErrorEvent (/app/node_modules/pg/lib/client.js:315:19)"
        )
      );

    try {
      const res = await agent.post(`/api/admin/users/${targetId}/role`).send({ role: "admin" });

      expect(res.status).toBe(500);
      const bodyText = JSON.stringify(res.body).toLowerCase();
      expect(bodyText).not.toMatch(
        /select|update|delete|"user"|deactivatedat|pg\/lib|node_modules|client\.js|constraint/
      );
      expect(res.body).toMatchObject({ error: "An unexpected error occurred" });
    } finally {
      spy.mockRestore();
    }

    const row = await fetchRawUserRow(targetId);
    expect(row).not.toBeNull();
    expect(row!.admin).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/:id/revoke-sessions — force sign-out without
// deactivating (US4, FR-009, FR-010, FR-011)
//
// RED: usersController.ts does not mount POST
// /api/admin/users/:id/revoke-sessions yet, so requests that reach past
// requireAdmin fall through to Express's default 404 handler — every
// non-404-expecting assertion below fails (actual 404).
// ---------------------------------------------------------------------------

describe("POST /api/admin/users/:id/revoke-sessions", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — force-sign-out a user with active sessions, returning the
  //    updated row plus revoked: N; status stays 'active' (FR-009)
  // -------------------------------------------------------------------------
  it("200: revokes all active sessions for a target, returning revoked: N and status 'active'", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `revoke-active-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });
    await insertTestSession(targetId);
    await insertTestSession(targetId);
    await insertTestSession(targetId);

    const res = await agent.post(`/api/admin/users/${targetId}/revoke-sessions`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, status: "active", revoked: 3 });
    expect(await countSessions(targetId)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. 200 — force-sign-out a user with zero sessions succeeds, revoked: 0
  //    (not an error — spec Edge Cases)
  // -------------------------------------------------------------------------
  it("200: revoking sessions for a target with zero sessions succeeds with revoked: 0 (not an error)", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `revoke-none-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const res = await agent.post(`/api/admin/users/${targetId}/revoke-sessions`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: targetId, status: "active", revoked: 0 });
  });

  // -------------------------------------------------------------------------
  // 3. 404 — revoke-sessions on a nonexistent id
  // -------------------------------------------------------------------------
  it("404: revoking sessions for a nonexistent id returns USER_NOT_FOUND", async () => {
    const agent = await loggedInAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/revoke-sessions`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "USER_NOT_FOUND" });
  });

  // -------------------------------------------------------------------------
  // 4. 403 — missing/foreign same-origin header (requireSameOrigin CSRF
  //    defense), mirrors the deactivate-route origin-check test
  // -------------------------------------------------------------------------
  it("403: admin session with foreign Origin is rejected (requireSameOrigin CSRF defense)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = await loggedInAgent();
      const targetEmail = `origin-check-revoke-${crypto.randomUUID()}@example.com`;
      const targetId = await insertUserRow(targetEmail, { admin: false });

      const res = await agent
        .post(`/api/admin/users/${targetId}/revoke-sessions`)
        .set("Origin", "https://attacker.example.com");

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 5a. 401 — unauthenticated request
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/revoke-sessions`);

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 5b. 403 — signed-in non-admin (Standard user)
  // -------------------------------------------------------------------------
  it("403: signed-in non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/users/${fakeId}/revoke-sessions`);

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 6. 200 — force-sign-out on the acting admin's OWN row succeeds (no
  //    self-exclusion — allowed by design, see US4 Implementation
  //    Constraints), returning isSelf: true and revoked: N
  // -------------------------------------------------------------------------
  it("200: force-sign-out on the admin's own row succeeds with isSelf: true and revoked: N", async () => {
    const agent = await loggedInAgent();
    // The unit-suite better-auth shim always signs the admin in with id
    // "user-test-id" (the mock-admin row seeded in jestSetupAfterEnv.ts).
    // Signing in via loggedInAgent() already created one active session for
    // this id; add two more so the expected revoked count is unambiguous.
    const selfId = "user-test-id";
    await insertTestSession(selfId);
    await insertTestSession(selfId);
    const expectedRevoked = await countSessions(selfId);

    const res = await agent.post(`/api/admin/users/${selfId}/revoke-sessions`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: selfId, isSelf: true, revoked: expectedRevoked });
  });

  // -------------------------------------------------------------------------
  // 7. 500 — a simulated revokeSessions DB failure returns a generic body
  //    (unexpected-error branch, lines 283-284).
  // -------------------------------------------------------------------------
  it("500: a simulated revokeSessions DB failure returns a generic body", async () => {
    const agent = await loggedInAgent();
    const targetEmail = `revoke-db-failure-${crypto.randomUUID()}@example.com`;
    const targetId = await insertUserRow(targetEmail, { admin: false });

    const userStore = require("../auth/userStore") as typeof import("../auth/userStore");
    const spy = jest
      .spyOn(userStore, "revokeSessions")
      .mockRejectedValueOnce(
        new Error(
          'delete from "session" where "userId" = $1 -- Connection terminated unexpectedly' +
            " at Client._handleErrorEvent (/app/node_modules/pg/lib/client.js:315:19)"
        )
      );

    try {
      const res = await agent.post(`/api/admin/users/${targetId}/revoke-sessions`);

      expect(res.status).toBe(500);
      const bodyText = JSON.stringify(res.body).toLowerCase();
      expect(bodyText).not.toMatch(
        /select|update|delete|"user"|"session"|pg\/lib|node_modules|client\.js|constraint/
      );
      expect(res.body).toMatchObject({ error: "An unexpected error occurred" });
    } finally {
      spy.mockRestore();
    }
  });
});

// -----------------------------------------------------------------------------
// getAdminId(req) — both branches unit-tested directly.
//
// requireAdmin always populates req.user before any of the four mutating
// routes above run, so the "unknown" fallback is unreachable through the real
// HTTP route stack above (there's no way to send a real request that reaches
// these handlers with req.user unset). This helper is exercised directly with
// a plain object instead, per the coverage-remediation finding on
// lessons-from-luke-q8m0.10.
// -----------------------------------------------------------------------------
describe("getAdminId(req)", () => {
  it("returns req.user.id when a session user is present", () => {
    const req = { user: { id: "admin-123", admin: true } } as unknown as Request;

    expect(getAdminId(req)).toBe("admin-123");
  });

  it('falls back to "unknown" when req.user is unset', () => {
    const req = {} as Request;

    expect(getAdminId(req)).toBe("unknown");
  });
});
