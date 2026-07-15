/**
 * Controller tests for POST /api/admin/users/:userId/revoke-sessions
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Plan: specs/004-desktop-auth-pairing/plan.md §Security Considerations
 * Contract: specs/004-desktop-auth-pairing/contracts/admin-revoke-api.yaml
 *
 * These tests use the real test database via loggedInAgent() / plainAgent()
 * from testHelper.ts, consistent with existing controller tests.
 */

/// <reference types="jest" />

import crypto from "crypto";
import { Pool } from "pg";
import { loggedInAgent, plainAgent } from "../testHelper";
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
 * Insert a non-admin user directly into the auth tables (bypasses disabled sign-up).
 * Returns { userId, email, password } for the created user.
 */
async function createTestUser(): Promise<{ userId: string; email: string; password: string }> {
  const email = `revoke-target-${crypto.randomUUID()}@example.com`;
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
       VALUES ($1,$2,'TestUser',false,false,$3,$3)`,
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

  return { userId, email: email.toLowerCase(), password };
}

/**
 * Insert a non-admin user and return an agent signed in as them.
 */
async function nonAdminAgent() {
  const { email, password } = await createTestUser();
  const agent = plainAgent();
  await agent.post("/api/auth/sign-in/email").send({ email, password });
  return agent;
}

/**
 * Insert a session row directly into the auth "session" table for the given user.
 * Returns the session id. This bypasses the better-auth unit-test shim (which
 * stores sessions only in memory, not in the real DB) so revokeUserSessions can
 * find and delete the row.
 */
async function insertSessionForUser(userId: string): Promise<string> {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(Date.now() + 3600 * 1000);

  const client = await authPool.connect();
  try {
    await client.query(
      `INSERT INTO "session" ("id","userId","token","expiresAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$5)`,
      [sessionId, userId, token, expiresAt, now]
    );
  } finally {
    client.release();
  }

  return sessionId;
}

// ---------------------------------------------------------------------------
// POST /api/admin/users/:userId/revoke-sessions
// ---------------------------------------------------------------------------

describe("POST /api/admin/users/:userId/revoke-sessions", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — admin revokes sessions for an existing user with an active session
  // -------------------------------------------------------------------------
  it("200: admin revokes all sessions for a user and returns success + revokedCount", async () => {
    const { userId } = await createTestUser();

    // Insert a real session row directly so revokeUserSessions can delete it.
    // (In unit tests the better-auth shim stores sessions in memory only,
    //  so signing in via HTTP would not create a DB row.)
    await insertSessionForUser(userId);

    const adminAgent = await loggedInAgent();
    const res = await adminAgent.post(`/api/admin/users/${userId}/revoke-sessions`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      userId,
      revokedCount: 1,
    });
  });

  // -------------------------------------------------------------------------
  // 2. 200 — admin revokes for user with no sessions (revokedCount = 0)
  // -------------------------------------------------------------------------
  it("200: returns success when user exists but has no sessions (revokedCount = 0)", async () => {
    const { userId } = await createTestUser();
    // Do NOT sign in — user has no session

    const adminAgent = await loggedInAgent();
    const res = await adminAgent.post(`/api/admin/users/${userId}/revoke-sessions`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      userId,
      revokedCount: 0,
    });
  });

  // -------------------------------------------------------------------------
  // 3. 401 — unauthenticated request rejected by requireAdmin
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();
    const res = await agent.post(`/api/admin/users/${crypto.randomUUID()}/revoke-sessions`);
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 4. 403 — non-admin session rejected by requireAdmin
  // -------------------------------------------------------------------------
  it("403: non-admin session is rejected by requireAdmin gate", async () => {
    const agent = await nonAdminAgent();
    const res = await agent.post(`/api/admin/users/${crypto.randomUUID()}/revoke-sessions`);
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 5. 403 — admin session with no Origin (CSRF defense)
  //    requireSameOrigin: no Origin or Referer → 403
  //    BETTER_AUTH_ENFORCE_ORIGIN=1 activates the check in test mode
  // -------------------------------------------------------------------------
  it("403: admin session with no Origin header is rejected (CSRF defense)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const adminAgent = await loggedInAgent();
      // Do not set Origin or Referer — raw supertest requests omit Origin by default
      const res = await adminAgent
        .post(`/api/admin/users/${crypto.randomUUID()}/revoke-sessions`)
        .unset("Origin");

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 6. 404 — unknown userId
  // -------------------------------------------------------------------------
  it("404: returns 404 for unknown userId", async () => {
    const adminAgent = await loggedInAgent();
    const res = await adminAgent.post(`/api/admin/users/${crypto.randomUUID()}/revoke-sessions`);
    expect(res.status).toBe(404);
  });
});
