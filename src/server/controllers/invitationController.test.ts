/**
 * Controller tests for POST /api/admin/invitations.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-006, §FR-020
 * Plan: plan.md §Security Considerations (Pass 4 CSRF), contracts/invitation-api.yaml
 *       §/api/admin/invitations POST
 *
 * These tests use the real test database via loggedInAgent() / plainAgent() from
 * testHelper.ts, consistent with existing controller tests.
 *
 * RED: the invitationController.ts module does not yet exist — all tests should fail.
 */

/// <reference types="jest" />

import { Pool } from "pg";
import crypto from "crypto";
import { plainAgent, loggedInAgent } from "../testHelper";
import secrets from "../util/secrets";

// ---------------------------------------------------------------------------
// Auth pool for inserting test users directly (sign-up is disabled globally).
// Mirrors the pattern in auth.integration.test.ts.
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
 * Returns the agent signed in as that user.
 */
async function nonAdminAgent() {
  const email = `nonadmin-ctrl-test-${crypto.randomUUID()}@example.com`;
  const password = "TestPassword1!";
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = new Date();

  // Import lazily to avoid circular issues and to mirror auth.integration.test.ts
  const { hash: argon2idHash } = require("../auth/passwordHasher") as typeof import("../auth/passwordHasher");
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
  await agent
    .post("/api/auth/sign-in/email")
    .send({ email, password });
  return agent;
}

// ---------------------------------------------------------------------------
// POST /api/admin/invitations — create an invitation
// ---------------------------------------------------------------------------

describe("POST /api/admin/invitations", () => {
  // -------------------------------------------------------------------------
  // 1. 201 — admin creates invitation for new email with role 'standard'
  // -------------------------------------------------------------------------
  it("201: admin creates invitation for a new email with role 'standard'", async () => {
    const agent = await loggedInAgent();
    const email = `invited-standard-${crypto.randomUUID()}@example.com`;

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email, role: "standard" });

    expect(res.status).toBe(201);
    // Response shape: {id, email, role, status, link, expiresAt}
    expect(res.body).toMatchObject({
      email: email.toLowerCase(),
      role: "standard",
      status: "pending",
    });
    expect(typeof res.body.id).toBe("string");
    expect(res.body.id.length).toBeGreaterThan(0);
    expect(typeof res.body.link).toBe("string");
    expect(res.body.link).toMatch(/\/invitation\//);
    expect(typeof res.body.expiresAt).toBe("string");
    // Cache-Control: no-store must be set (red-team Pass 8)
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 2. 201 — admin creates invitation with role 'admin'
  // -------------------------------------------------------------------------
  it("201: admin creates invitation with role 'admin'", async () => {
    const agent = await loggedInAgent();
    const email = `invited-admin-${crypto.randomUUID()}@example.com`;

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email, role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      role: "admin",
      status: "pending",
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 3. 401 — unauthenticated request
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected by requireAdmin gate", async () => {
    const agent = plainAgent();

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email: "anyone@example.com", role: "standard" });

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 4. 403 — authenticated non-admin request
  // -------------------------------------------------------------------------
  it("403: non-admin session is rejected by requireAdmin gate", async () => {
    const agent = await nonAdminAgent();

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email: "anyone@example.com", role: "standard" });

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 5. 403 — valid admin session but Origin not in BETTER_AUTH_URL allow-list
  //    (CSRF defense, red-team Pass 4)
  //    We set BETTER_AUTH_ENFORCE_ORIGIN=1 in environment to activate the check
  //    and send a foreign Origin that is not in the allow-list.
  // -------------------------------------------------------------------------
  it("403: admin session with foreign Origin is rejected (CSRF defense)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = await loggedInAgent();

      const res = await agent
        .post("/api/admin/invitations")
        .set("Origin", "https://attacker.example.com")
        .send({ email: "victim@example.com", role: "standard" });

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 6. 400 — email > 254 chars rejected
  // -------------------------------------------------------------------------
  it("400: rejects email longer than 254 characters", async () => {
    const agent = await loggedInAgent();
    const localPart = "a".repeat(245);
    const longEmail = `${localPart}@example.com`; // 257 chars
    expect(longEmail.length).toBeGreaterThan(254);

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email: longEmail, role: "standard" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 7. 400 — invalid role rejected
  // -------------------------------------------------------------------------
  it("400: rejects an invalid role", async () => {
    const agent = await loggedInAgent();

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email: "valid@example.com", role: "superuser" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 8. 409 — email already has an account (FR-004 AccountExistsError)
  // -------------------------------------------------------------------------
  it("409: rejects when email already has an account (FR-004)", async () => {
    const agent = await loggedInAgent();
    // Insert a test user directly into the auth tables
    const existingEmail = `existing-account-${crypto.randomUUID()}@example.com`;
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const now = new Date();
    const client = await authPool.connect();
    try {
      await client.query(
        `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
         VALUES ($1,$2,'ExistingUser',false,false,$3,$3)`,
        [userId, existingEmail.toLowerCase(), now]
      );
      await client.query(
        `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
         VALUES ($1,$2,$2,'credential','placeholder-hash',$3,$3)`,
        [accountId, userId, now]
      );
    } finally {
      client.release();
    }

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email: existingEmail, role: "standard" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 9. 409 — active pending invite already exists (FR-005 ActivePendingError)
  // -------------------------------------------------------------------------
  it("409: rejects when an active pending invitation already exists for this email (FR-005)", async () => {
    const agent = await loggedInAgent();
    const email = `pending-conflict-${crypto.randomUUID()}@example.com`;

    // Create the first invitation — should succeed
    const first = await agent
      .post("/api/admin/invitations")
      .send({ email, role: "standard" });
    expect(first.status).toBe(201);

    // Create a second invitation for the same email — should conflict
    const second = await agent
      .post("/api/admin/invitations")
      .send({ email, role: "admin" });

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: expect.any(String) });
  });
});
