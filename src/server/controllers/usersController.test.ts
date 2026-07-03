/**
 * Controller tests for GET /api/admin/users — the account roster (US1).
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002, §FR-010
 * Plan: contracts/user-admin-api.yaml paths./api/admin/users.get
 *
 * These tests use the real test database via loggedInAgent() / plainAgent() from
 * testHelper.ts, consistent with existing controller tests (mirrors
 * invitationController.test.ts's admin-list-route tests). requireAdmin is
 * already mounted at app.use("/api/admin", requireAdmin) in serverApp.ts, so
 * the 401/403 assertions below exercise real middleware even before
 * usersController exists.
 *
 * RED: usersController.ts does not exist yet and is not mounted in
 * serverApp.ts, so GET /api/admin/users falls through past requireAdmin to
 * Express's default 404 handler for authenticated requests — every
 * 200-expecting assertion below fails (actual 404, not 200).
 */

/// <reference types="jest" />

import { Pool } from "pg";
import crypto from "crypto";
import { plainAgent, loggedInAgent } from "../testHelper";
import secrets from "../util/secrets";

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
});
