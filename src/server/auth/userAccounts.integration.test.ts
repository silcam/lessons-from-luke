/**
 * Integration tests for admin user-account management: sign-in rejection,
 * live-session revocation, role-change propagation, and the concurrent
 * last-admin guard (US2, US3, US4).
 *
 * These tests run against the real test database (lessons-from-luke-test)
 * via `yarn test:integration`. They exercise the real compiled server (real
 * better-auth child process — better-auth is ESM-only, hence the separate
 * integration harness — NOT the Jest/CommonJS unit mock used by
 * userStore.test.ts / usersController.test.ts / requireUser.test.ts).
 *
 * Spec: specs/006-user-account-management/spec.md §SC-003..SC-005,
 *       §Edge Cases ("Last-admin guardrail under concurrency")
 * Plan: plan.md §Project Structure (userAccounts.integration.test.ts NEW),
 *       quickstart.md §Test entry points, data-model.md §Last-admin lock
 * Reference: mirrors src/server/auth/invitation.integration.test.ts and
 *            auth.integration.test.ts
 *
 * Why integration tests (in addition to the unit tests already written per
 * story): Unit tests (userStore.test.ts, usersController.test.ts,
 * requireUser.test.ts) run under Jest/CommonJS with the better-auth CJS
 * mock, which caches `session.user` at sign-in and does NOT observe a
 * mid-session deactivation or role change. The cross-layer behaviors below
 * require the real compiled server + real better-auth.
 */
import request from "supertest";
import { Pool } from "pg";
import crypto from "crypto";
import secrets from "../util/secrets";
import { hash as argon2idHash } from "./passwordHasher";

// ------------------------------------------------------------------
// Server connection
// ------------------------------------------------------------------

// The integration test server is started by jestIntegrationGlobalSetup.ts
// as a compiled child process (avoids Jest/ESM conflict with better-auth).
// Asserted as a definite `string` so the hoisted helper functions below —
// whose bodies TS analyzes without the post-guard narrowing in scope — also
// see `string`, not `string | undefined` (mirrors invitation.integration.test.ts).
const serverUrl: string = (() => {
  const url = process.env.INTEGRATION_SERVER_URL;
  if (!url) {
    throw new Error("INTEGRATION_SERVER_URL is not set. Run tests via `yarn test:integration`.");
  }
  return url;
})();

// supertest can accept a URL string directly to make requests against a running server
const agent = () => request.agent(serverUrl);

// ------------------------------------------------------------------
// DB pool for direct inspection / fixture insertion
// ------------------------------------------------------------------

const { username: testDbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const dbPool = new Pool({ ...restTestDb, user: testDbUser, max: 2 });

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();
const adminPassword = secrets.adminPassword;

async function signIn(email: string, password: string) {
  const a = agent();
  await a.post("/api/auth/sign-in/email").send({ email, password }).expect(200);
  return a;
}

async function signedInAdminAgent() {
  return signIn(adminEmail, adminPassword);
}

/**
 * Inserts a "user" (+ credential "account") row directly on the auth pool,
 * bypassing the disabled public sign-up route, so the account can sign in
 * with a known password. Mirrors auth.integration.test.ts's
 * insertNonAdminUser, parameterized with an `admin` flag so it can seed a
 * second admin for the concurrency scenarios.
 */
async function insertUser(
  email: string,
  password: string,
  opts: { admin?: boolean } = {}
): Promise<string> {
  const passwordHash = await argon2idHash(password);
  const now = new Date();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const client = await dbPool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,false,$5,$5)`,
      [userId, email.toLowerCase(), "Integration Test User", opts.admin ?? false, now]
    );
    await client.query(
      `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
       VALUES ($1,$2,$2,'credential',$3,$4,$4)`,
      [accountId, userId, passwordHash, now]
    );
  } finally {
    client.release();
  }
  return userId;
}

/** Looks up the seeded admin's user id directly. */
async function seededAdminId(): Promise<string> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "user" WHERE LOWER(email) = $1`,
      [adminEmail]
    );
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/** Counts active (non-deactivated) admins directly — the last-admin invariant. */
async function activeAdminCount(): Promise<number> {
  const client = await dbPool.connect();
  try {
    const result = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM "user" WHERE admin = true AND "deactivatedAt" IS NULL`
    );
    return Number(result.rows[0].count);
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------

afterAll(async () => {
  await dbPool.end();
});

// ------------------------------------------------------------------
// 1. Full deactivate flow end-to-end (US2, SC-003)
// ------------------------------------------------------------------

test(
  "Full deactivate flow: live session's next request unauthenticated AND a fresh " +
    "sign-in attempt fails (both enforcement points, real server) (SC-003)",
  async () => {
    const email = "integration-deactivate-flow@example.com";
    const password = "SecurePassword1!";
    const userId = await insertUser(email, password, { admin: false });

    const userAgent = await signIn(email, password);
    // Confirm the session is genuinely live before deactivation: a signed-in
    // non-admin gets 403 (forbidden), not 401 (unauthenticated).
    await userAgent.get("/api/admin/languages").expect(403);

    const adminAgent = await signedInAdminAgent();
    await adminAgent
      .post(`/api/admin/users/${userId}/deactivate`)
      .set("Origin", serverUrl)
      .expect(200);

    // Enforcement point 1: the deactivated account's live session's next
    // request is now unauthenticated (401), not merely forbidden.
    await userAgent.get("/api/admin/languages").expect(401);

    // Enforcement point 2: a fresh sign-in attempt with correct credentials
    // also fails.
    const freshRes = await agent().post("/api/auth/sign-in/email").send({ email, password });
    expect(freshRes.status).not.toBe(200);
  }
);

// ------------------------------------------------------------------
// 2. Reactivate restores sign-in (US2, SC-004)
// ------------------------------------------------------------------

test(
  "Reactivate restores sign-in: deactivate -> reactivate -> the account can " +
    "sign in again with its original credentials (SC-004)",
  async () => {
    const email = "integration-reactivate-flow@example.com";
    const password = "SecurePassword1!";
    const userId = await insertUser(email, password, { admin: false });

    const adminAgent = await signedInAdminAgent();
    await adminAgent
      .post(`/api/admin/users/${userId}/deactivate`)
      .set("Origin", serverUrl)
      .expect(200);

    // Confirmed dead while deactivated.
    const deactivatedRes = await agent().post("/api/auth/sign-in/email").send({ email, password });
    expect(deactivatedRes.status).not.toBe(200);

    await adminAgent
      .post(`/api/admin/users/${userId}/reactivate`)
      .set("Origin", serverUrl)
      .expect(200);

    const reactivatedRes = await agent().post("/api/auth/sign-in/email").send({ email, password });
    expect(reactivatedRes.status).toBe(200);
  }
);

// ------------------------------------------------------------------
// 3. Concurrent last-admin guard: deactivate vs deactivate (FR-012)
// ------------------------------------------------------------------

test(
  "Concurrent last-admin guard, deactivate vs deactivate: with exactly two " +
    "active admins, one concurrent deactivate-the-other succeeds (200) and " +
    "the other is refused — never both (FR-012)",
  async () => {
    const email = "integration-concurrent-deactivate-b@example.com";
    const password = "SecurePassword1!";
    const adminBId = await insertUser(email, password, { admin: true });
    const adminAId = await seededAdminId();

    const agentA = await signedInAdminAgent();
    const agentB = await signIn(email, password);

    const [resA, resB] = await Promise.all([
      agentA.post(`/api/admin/users/${adminBId}/deactivate`).set("Origin", serverUrl),
      agentB.post(`/api/admin/users/${adminAId}/deactivate`).set("Origin", serverUrl),
    ]);

    const successCount = [resA.status, resB.status].filter((s) => s === 200).length;
    expect(successCount).toBe(1);

    // The losing request is refused either at the business-logic layer (409
    // LAST_ADMIN — data-model.md's shared FOR UPDATE guard) OR, when the
    // winner's deactivation commits first and its target IS the loser's own
    // acting admin, at the auth layer (401 Unauthorized) — deactivation
    // revokes the target's sessions immediately (FR-005), and here each
    // request's actor is the OTHER request's target, so the loser's own
    // in-flight session can be revoked out from under it before its request
    // reaches the LAST_ADMIN check. Both outcomes prove the pair can never
    // BOTH succeed; which one manifests is a genuine race, observed as both
    // possibilities across repeated local runs of this test.
    const refused = resA.status === 200 ? resB : resA;
    expect([401, 409]).toContain(refused.status);
    if (refused.status === 409) {
      expect(refused.body.code).toBe("LAST_ADMIN");
    }

    // Never zero active admins.
    expect(await activeAdminCount()).toBeGreaterThanOrEqual(1);
  }
);

// ------------------------------------------------------------------
// 4. Concurrent last-admin guard: demote vs demote (FR-012)
// ------------------------------------------------------------------

test(
  "Concurrent last-admin guard, demote vs demote: with exactly two active " +
    "admins, one concurrent demote-the-other-via-role succeeds (200) and the " +
    "other is refused (409 LAST_ADMIN) — never both (FR-012)",
  async () => {
    const email = "integration-concurrent-demote-b@example.com";
    const password = "SecurePassword1!";
    const adminBId = await insertUser(email, password, { admin: true });
    const adminAId = await seededAdminId();

    const agentA = await signedInAdminAgent();
    const agentB = await signIn(email, password);

    const [resA, resB] = await Promise.all([
      agentA
        .post(`/api/admin/users/${adminBId}/role`)
        .set("Origin", serverUrl)
        .send({ role: "standard" }),
      agentB
        .post(`/api/admin/users/${adminAId}/role`)
        .set("Origin", serverUrl)
        .send({ role: "standard" }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const refused = resA.status === 409 ? resA : resB;
    expect(refused.body.code).toBe("LAST_ADMIN");

    // Never zero active admins.
    expect(await activeAdminCount()).toBeGreaterThanOrEqual(1);
  }
);

// ------------------------------------------------------------------
// 5. Concurrent last-admin guard: CROSS mutation type (FR-012)
// ------------------------------------------------------------------

test(
  "Concurrent last-admin guard, cross mutation type: with exactly two active " +
    "admins, a concurrent deactivate and demote each targeting the OTHER admin " +
    "never both succeed — the system never reaches zero active admins (FR-012)",
  async () => {
    const email = "integration-concurrent-cross-b@example.com";
    const password = "SecurePassword1!";
    const adminBId = await insertUser(email, password, { admin: true });
    const adminAId = await seededAdminId();

    const agentA = await signedInAdminAgent();
    const agentB = await signIn(email, password);

    // agentA deactivates B; agentB demotes A — concurrently, cross mutation types.
    const [deactivateRes, demoteRes] = await Promise.all([
      agentA.post(`/api/admin/users/${adminBId}/deactivate`).set("Origin", serverUrl),
      agentB
        .post(`/api/admin/users/${adminAId}/role`)
        .set("Origin", serverUrl)
        .send({ role: "standard" }),
    ]);

    const successCount = [deactivateRes.status, demoteRes.status].filter((s) => s === 200).length;
    // Never both succeed — at least one of the two is refused, either as a
    // 409 LAST_ADMIN (business-logic guard) or a 401 (the loser's own
    // session revoked out from under it when the winning deactivate targets
    // it — see the deactivate-vs-deactivate test above for the full
    // explanation of that compounding race).
    expect(successCount).toBeLessThanOrEqual(1);

    // Never zero active admins — the load-bearing regression guard (FR-012).
    expect(await activeAdminCount()).toBeGreaterThanOrEqual(1);
  }
);

// ------------------------------------------------------------------
// 6. Role-change propagation without revoke (US3, Decision 2)
// ------------------------------------------------------------------

test(
  "Promoting a Standard user propagates on their very next authenticated " +
    "request without any explicit session refresh/revoke (Decision 2 — " +
    "cookieCache disabled)",
  async () => {
    const email = "integration-promote-propagation@example.com";
    const password = "SecurePassword1!";
    const userId = await insertUser(email, password, { admin: false });

    const userAgent = await signIn(email, password);
    // Confirmed non-admin (forbidden, not unauthenticated) before promotion.
    await userAgent.get("/api/admin/languages").expect(403);

    const adminAgent = await signedInAdminAgent();
    await adminAgent
      .post(`/api/admin/users/${userId}/role`)
      .set("Origin", serverUrl)
      .send({ role: "admin" })
      .expect(200);

    // No sign-out/sign-in, no explicit revoke — the SAME agent's very next
    // authenticated request reflects the new admin role.
    await userAgent.get("/api/admin/languages").expect(200);
  }
);

// ------------------------------------------------------------------
// 7. CSRF (same-origin) enforcement on all four mutating POST routes
// ------------------------------------------------------------------

test(
  "CSRF: wrong Origin -> 403 on all four mutating admin user routes " +
    "(role, deactivate, reactivate, revoke-sessions)",
  async () => {
    const targetId = await insertUser("integration-csrf-target@example.com", "SecurePassword1!", {
      admin: false,
    });
    const adminAgent = await signedInAdminAgent();
    const evilOrigin = "https://evil.example.com";

    const roleRes = await adminAgent
      .post(`/api/admin/users/${targetId}/role`)
      .set("Origin", evilOrigin)
      .send({ role: "admin" });
    expect(roleRes.status).toBe(403);

    const deactivateRes = await adminAgent
      .post(`/api/admin/users/${targetId}/deactivate`)
      .set("Origin", evilOrigin);
    expect(deactivateRes.status).toBe(403);

    const reactivateRes = await adminAgent
      .post(`/api/admin/users/${targetId}/reactivate`)
      .set("Origin", evilOrigin);
    expect(reactivateRes.status).toBe(403);

    const revokeRes = await adminAgent
      .post(`/api/admin/users/${targetId}/revoke-sessions`)
      .set("Origin", evilOrigin);
    expect(revokeRes.status).toBe(403);
  }
);
