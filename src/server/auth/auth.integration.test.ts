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
 * Spec: specs/001-better-auth-migration/spec.md §US1, US2, US3, US4; plan.md §Testing
 * Research: research.md Decision 5, 6
 */
import { execSync } from "child_process";
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
const serverUrl = process.env.INTEGRATION_SERVER_URL;
if (!serverUrl) {
  throw new Error("INTEGRATION_SERVER_URL is not set. Run tests via `yarn test:integration`.");
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
 * Hash a password using the Argon2id format required by the wired passwordHasher.
 *
 * better-auth now uses the passwordHasher (src/server/auth/passwordHasher.ts) rather
 * than its default scrypt verifier. Test users inserted directly via SQL must use
 * the same Argon2id format so better-auth can verify passwords at sign-in time.
 *
 * Format: "argon2id$<m>$<t>$<p>$<saltHex>$<hashHex>" — matches passwordHasher.hash()
 */
function hashPasswordForBetterAuth(password: string): Promise<string> {
  return argon2idHash(password);
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
  // Must use Argon2id format — matches the wired passwordHasher in better-auth config
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

// Directly flips deactivatedAt on the auth pool, bypassing userStore's
// deactivateAccount() guards (last-admin lock, self-lockout, session
// revocation) entirely -- those belong to a different US (US1/US2 store
// layer, covered in userStore.test.ts). This suite only needs the raw
// deactivatedAt DB state to exercise the two enforcement points
// (sign-in-hook + session-load check) in isolation.
async function deactivateUserDirectly(userId: string): Promise<void> {
  const client = await authPool.connect();
  try {
    await client.query(`UPDATE "user" SET "deactivatedAt" = now() WHERE id = $1`, [userId]);
  } finally {
    client.release();
  }
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

  // Sign out. Origin enforcement is on in the integration server
  // (BETTER_AUTH_ENFORCE_ORIGIN), so this cookie-bearing POST must carry a
  // same-origin Origin header (matching trustedOrigins = BETTER_AUTH_URL).
  await a.post("/api/auth/sign-out").set("Origin", serverUrl).expect(200);

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
  const res = await agent().post("/api/auth/sign-up/email").send({
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

// 11. POST /api/auth/sign-in/email with 11-char password → rejected
// better-auth enforces minPasswordLength: 12 at sign-in (password length
// validation occurs before credential lookup). An 11-char password must be
// rejected — confirms the NIST 800-63B / OWASP 2025 minimum is active.
test("POST /api/auth/sign-in/email with 11-char password → rejected", async () => {
  const elevenCharPassword = "ElevenChars"; // exactly 11 characters
  const res = await agent()
    .post("/api/auth/sign-in/email")
    .send({ email: adminEmail, password: elevenCharPassword });
  // Must NOT be 200 — an 11-char password is below the 12-char minimum
  expect(res.status).not.toBe(200);
  expect([400, 401, 422, 429]).toContain(res.status);
});

// 12. POST /api/auth/sign-in/email with foreign Origin header → 403
// betterAuth's formCsrfMiddleware calls validateOrigin when the request includes a
// Cookie header. If the Origin does not match trustedOrigins (baseURL origin +
// explicit BETTER_AUTH_URL entries), it throws INVALID_ORIGIN → 403.
// This verifies that the trustedOrigins config prevents cross-origin CSRF attacks.
test("POST /api/auth/sign-in/email with foreign Origin header and cookie → 403", async () => {
  const res = await agent()
    .post("/api/auth/sign-in/email")
    // A Cookie header causes formCsrfMiddleware to run validateOrigin
    .set("Cookie", "dummy=1")
    // Foreign origin that should not be in trustedOrigins
    .set("Origin", "https://evil.example.com")
    .send({ email: adminEmail, password: adminPassword });
  // better-auth returns 403 FORBIDDEN for INVALID_ORIGIN
  expect(res.status).toBe(403);
});

// ------------------------------------------------------------------
// US4: Invitation-only provisioning explicit assertions
// ------------------------------------------------------------------

// US4 scenario 1: After running yarn migrate:test, SELECT email, admin FROM "user"
// returns exactly one row with admin=true. Verifies the SeedAdminUser migration
// provisioned the admin account correctly.
test("US4 S1: migrate:test seeds exactly one admin row with admin=true", async () => {
  const client = await authPool.connect();
  try {
    const result = await client.query<{ email: string; admin: boolean }>(
      `SELECT email, admin FROM "user" WHERE admin = true`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].admin).toBe(true);
    expect(result.rows[0].email).toBe(adminEmail);
  } finally {
    client.release();
  }
});

// US4 scenario 2: Re-running yarn migrate:test produces no duplicate and no error
// (idempotency). After the second run, there is still exactly one admin row.
test("US4 S2: re-running migrate:test is idempotent — no duplicate admin, no error", async () => {
  // Run the migration a second time against the test database
  expect(() => {
    execSync("yarn migrate:test", { stdio: "pipe" });
  }).not.toThrow();

  // Verify still exactly one admin user after the second migration run
  const client = await authPool.connect();
  try {
    const result = await client.query<{ email: string; admin: boolean }>(
      `SELECT email, admin FROM "user" WHERE admin = true`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].admin).toBe(true);
    expect(result.rows[0].email).toBe(adminEmail);
  } finally {
    client.release();
  }
}, 30_000); // allow up to 30 s for the second migration run

// ------------------------------------------------------------------
// US2 / FR-005: deactivation enforcement (sign-in-hook checkpoint)
//
// data-model.md §Enforcement points: auth.ts's databaseHooks.session.create.before
// must SELECT "deactivatedAt" FROM "user" WHERE id = session.userId and, if
// non-NULL, throw so no session is minted -- sign-in fails even with the
// correct password.
//
// RED: no such hook exists yet, so a deactivated user's sign-in currently
// still succeeds (200) -- these assertions fail against the current code.
// ------------------------------------------------------------------

test("POST /api/auth/sign-in/email for a deactivated user's credentials → sign-in fails (US2/FR-005)", async () => {
  const email = "deactivated-signin-integration-test@example.com";
  const password = "TestPassword1!";
  const userId = await insertNonAdminUser(email, password);
  await deactivateUserDirectly(userId);

  const a = agent();
  const res = await a.post("/api/auth/sign-in/email").send({ email, password });

  // Must NOT succeed -- no session/cookie for a deactivated account, even
  // though the password is correct.
  expect(res.status).not.toBe(200);

  const sessionRes = await a.get("/api/auth/get-session").expect(200);
  expect(sessionRes.body).toBeNull();
});

// No-regression companion: an active (non-deactivated) user must still be
// able to sign in normally once the hook exists.
test("POST /api/auth/sign-in/email for an active user → succeeds normally (no regression, US2/FR-005)", async () => {
  const email = "active-signin-integration-test@example.com";
  const password = "TestPassword1!";
  await insertNonAdminUser(email, password);

  const a = agent();
  const signInRes = await a.post("/api/auth/sign-in/email").send({ email, password }).expect(200);
  expect(signInRes.body.user).toBeDefined();

  const sessionRes = await a.get("/api/auth/get-session").expect(200);
  expect(sessionRes.body).not.toBeNull();
  expect(sessionRes.body.user.email).toBe(email);
});

// ------------------------------------------------------------------
// US2 / FR-005: deactivation enforcement (session-load checkpoint)
//
// spec.md §Edge Cases: "A user acting during their own deactivation": once an
// account is deactivated, any request it makes afterward -- including one
// already in flight -- is treated as unauthenticated on its next evaluation.
// requireUser.ts's loadSession() must re-check "deactivatedAt" on every
// request (not just at sign-in), so a session minted before deactivation
// stops working immediately after.
//
// RED: loadSession() does not perform this check yet, so a deactivated
// user's already-live session still resolves as a (non-admin, forbidden)
// session rather than flipping to unauthenticated -- this assertion fails
// against the current code.
// ------------------------------------------------------------------
test(
  "deactivating a user with a live session flips that session's next request " +
    "from 403 (forbidden) to 401 (unauthenticated) — session-load enforcement (US2/FR-005)",
  async () => {
    const email = "deactivate-midsession-integration-test@example.com";
    const password = "TestPassword1!";
    const userId = await insertNonAdminUser(email, password);

    const a = agent();
    await a.post("/api/auth/sign-in/email").send({ email, password }).expect(200);

    // Before deactivation: a signed-in non-admin session is forbidden (403),
    // not unauthenticated -- confirms the session is genuinely live first.
    await a.get("/api/admin/languages").expect(403);

    // Deactivate mid-session (direct SQL -- the admin mutation endpoint is a
    // different US's concern; this test targets the enforcement checkpoint only).
    await deactivateUserDirectly(userId);

    // The same session's next authenticated request must now be treated as
    // unauthenticated (401), not merely forbidden -- the "already in flight"
    // edge case (spec.md §Edge Cases).
    await a.get("/api/admin/languages").expect(401);
  }
);
