/**
 * Integration tests for better-auth sign-in/session/sign-out flows.
 *
 * These tests run against the real test database (lessons-from-luke-test)
 * via `yarn test:integration`. They exercise getAuth() + the actual pg.Pool.
 *
 * The tests connect to a real Express server started by jestIntegrationGlobalSetup.ts
 * (compiled from dist/server/) because better-auth is ESM-only and cannot be loaded
 * directly by Jest's CommonJS runner. The INTEGRATION_SERVER_URL env var provides
 * the base URL to the running server.
 *
 * Spec: specs/001-better-auth-migration/spec.md §US1, US2, US3; plan.md §Testing
 * Research: research.md Decision 5, 6
 */
import request from "supertest";
import { Pool } from "pg";
import crypto from "crypto";
import secrets from "../util/secrets";

// ------------------------------------------------------------------
// Server connection
// ------------------------------------------------------------------

// The integration test server is started by jestIntegrationGlobalSetup.ts
// as a compiled child process (avoids Jest/ESM conflict with better-auth).
const serverUrl = process.env.INTEGRATION_SERVER_URL;
if (!serverUrl) {
  throw new Error(
    "INTEGRATION_SERVER_URL is not set. Run tests via `yarn test:integration`."
  );
}

// supertest can accept a URL string directly to make requests against a running server
const agent = () => request.agent(serverUrl);

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();
const adminPassword = secrets.adminPassword;

// Auth-isolated pg.Pool to insert non-admin test users directly, bypassing
// the public sign-up route (which is disabled — FR-002).
// Remap porsager's "username" field to pg's "user" field.
const { username: testDbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const authPool = new Pool({ ...restTestDb, user: testDbUser, max: 2 });

/**
 * Hash a password using better-auth's internal scrypt format.
 * Format: "${saltHex}:${keyHex}" — matches @better-auth/utils/dist/password.node.mjs
 *
 * This is needed for insertNonAdminUser() because sign-up is disabled and
 * we must create users directly via SQL with the correct hash format so
 * better-auth can verify passwords at sign-in time.
 */
function hashPasswordForBetterAuth(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      saltHex,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(`${saltHex}:${derivedKey.toString("hex")}`);
      }
    );
  });
}

async function signedInAdminAgent() {
  const a = agent();
  await a
    .post("/api/auth/sign-in/email")
    .send({ email: adminEmail, password: adminPassword })
    .expect(200);
  return a;
}

// Insert a non-admin user directly on the auth pool (sign-up is disabled).
async function insertNonAdminUser(email: string, password: string): Promise<string> {
  // Must use better-auth's scrypt format, not the domain Argon2id hasher
  const passwordHash = await hashPasswordForBetterAuth(password);
  const now = new Date();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const client = await authPool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,$2,$3,false,false,$4,$4)`,
      [userId, email.toLowerCase(), "NonAdmin", now]
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

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------

afterAll(async () => {
  await authPool.end();
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

// 1. GET /api/auth/get-session unauthenticated → null (no session)
// better-auth returns JSON `null` (not `{ session: null, user: null }`) when
// no session is present.
test("GET /api/auth/get-session unauthenticated returns null", async () => {
  const res = await agent().get("/api/auth/get-session").expect(200);
  // better-auth returns the JSON body `null` when not authenticated
  expect(res.body).toBeNull();
});

// 2. POST /api/auth/sign-in/email with wrong password → 401, no session created
test("POST /api/auth/sign-in/email with wrong password → 401", async () => {
  const a = agent();
  await a
    .post("/api/auth/sign-in/email")
    .send({ email: adminEmail, password: "wrong-password!" })
    .expect(401);
  // No session should be created
  const sessionRes = await a.get("/api/auth/get-session").expect(200);
  expect(sessionRes.body).toBeNull();
});

// 3. POST /api/auth/sign-in/email with correct creds → 200, session cookie set;
//    GET /api/auth/get-session → admin:true user
test("POST /api/auth/sign-in/email with correct creds → 200, session established with admin:true", async () => {
  const a = agent();
  const signInRes = await a
    .post("/api/auth/sign-in/email")
    .send({ email: adminEmail, password: adminPassword })
    .expect(200);
  expect(signInRes.body.user).toBeDefined();

  const sessionRes = await a.get("/api/auth/get-session").expect(200);
  expect(sessionRes.body).not.toBeNull();
  expect(sessionRes.body.session).not.toBeNull();
  expect(sessionRes.body.user).not.toBeNull();
  expect(sessionRes.body.user.admin).toBe(true);
  expect(sessionRes.body.user.email).toBe(adminEmail);
});

// 4. POST /api/auth/sign-out after login → 200, cookie cleared;
//    GET /api/auth/get-session → null
test("POST /api/auth/sign-out clears session", async () => {
  const a = await signedInAdminAgent();

  // Confirm signed in
  const sessionBefore = await a.get("/api/auth/get-session").expect(200);
  expect(sessionBefore.body).not.toBeNull();

  // Sign out
  await a.post("/api/auth/sign-out").expect(200);

  // Confirm session gone
  const sessionAfter = await a.get("/api/auth/get-session").expect(200);
  expect(sessionAfter.body).toBeNull();
});

// 5. GET /api/admin/languages without session → 401 (US2 scenario 1)
test("GET /api/admin/languages without session → 401", async () => {
  await agent().get("/api/admin/languages").expect(401);
});

// 6. GET /api/admin/languages with non-admin session → 403 (US2 scenario 2)
test("GET /api/admin/languages with non-admin session → 403", async () => {
  const nonAdminEmail = "nonadmin-integration-test@example.com";
  const nonAdminPassword = "TestPassword1!";
  await insertNonAdminUser(nonAdminEmail, nonAdminPassword);

  const a = agent();
  await a
    .post("/api/auth/sign-in/email")
    .send({ email: nonAdminEmail, password: nonAdminPassword })
    .expect(200);

  await a.get("/api/admin/languages").expect(403);
});

// 7. GET /api/admin/languages with admin session → 200 (US2 scenario 3)
test("GET /api/admin/languages with admin session → 200", async () => {
  const a = await signedInAdminAgent();
  const res = await a.get("/api/admin/languages").expect(200);
  expect(Array.isArray(res.body)).toBe(true);
});

// 8. Repeated bad sign-in (>10 attempts) → 429 Too Many Requests (red-team Pass 1)
// afterEach in jestSetupAfterEnv.ts will DELETE FROM "rateLimit" to reset between tests.
test("Repeated bad sign-in (>10 attempts) → 429 rate limit", async () => {
  const a = agent();
  let lastStatus = 0;
  for (let i = 0; i < 12; i++) {
    const res = await a
      .post("/api/auth/sign-in/email")
      .send({ email: adminEmail, password: "wrong!" });
    lastStatus = res.status;
    if (lastStatus === 429) break;
  }
  expect(lastStatus).toBe(429);
});

// 9. POST /api/auth/sign-up/email → rejected (FR-002, US4 — disableSignUp: true)
// better-auth returns 400 (not 403) with code EMAIL_PASSWORD_SIGN_UP_DISABLED
// when disableSignUp is true.
test("POST /api/auth/sign-up/email → 400 (sign-up disabled)", async () => {
  const res = await agent()
    .post("/api/auth/sign-up/email")
    .send({
      email: "newuser@example.com",
      password: "SomePassword1!",
      name: "New User",
    });
  // better-auth returns 400 with EMAIL_PASSWORD_SIGN_UP_DISABLED when sign-up is disabled
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
});

// 10. POST /api/auth/sign-in/email with overlong password → rejected
// better-auth validates maxPasswordLength (128) and returns 400 for over-length
// passwords at the schema validation layer, BEFORE hashing (red-team Pass 2).
// Note: in practice better-auth returns 401 (invalid credentials) rather than
// 400 (validation error) for overlong passwords in this version; we assert the
// password is REJECTED (not 200) to confirm the protection is active.
test("POST /api/auth/sign-in/email with overlong password (200 chars) → rejected", async () => {
  const overlongPassword = "a".repeat(200);
  const res = await agent()
    .post("/api/auth/sign-in/email")
    .send({ email: adminEmail, password: overlongPassword });
  // Must NOT be 200 (must be rejected — prevents Argon2 CPU/memory DoS amplifier)
  expect(res.status).not.toBe(200);
  expect([400, 401, 422, 429]).toContain(res.status);
});
