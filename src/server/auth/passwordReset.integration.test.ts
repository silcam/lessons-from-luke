/**
 * Integration tests for the complete password-reset flow.
 *
 * These tests run against the real test database (lessons-from-luke-test)
 * via `yarn test:integration`. They exercise the real compiled server
 * (better-auth is ESM-only, hence the separate integration harness). The
 * INTEGRATION_SERVER_URL env var provides the base URL.
 *
 * Token strategy (research.md §D9):
 *   The integration server uses MemoryEmailTransport (NODE_ENV=test, no
 *   secrets.email). GET /api/test/sent-emails (added to testController.ts)
 *   exposes the sentEmails buffer so tests can parse the reset token from
 *   the email link — no stdout parsing needed.
 *
 * Timing note (data-model.md §verification Pass 11):
 *   better-auth's /request-password-reset does account-conditional synchronous
 *   DB work (INSERT for known, dummy-SELECT for unknown) BEFORE calling our
 *   fire-and-forget sendResetPassword. This residual INSERT-vs-SELECT floor is
 *   outside our control. The timing-parity assertion uses a generous tolerance
 *   (1 second) rather than strict equality, per the spec.
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US1 Independent Test
 * Research: research.md §D4, §D8, §D9
 * Data model: data-model.md §verification, §rateLimit
 * Contracts: contracts/auth-password-reset-api.yaml
 */
import { createHmac } from "crypto";
import crypto from "crypto";
import request from "supertest";
import { Pool } from "pg";
import secrets from "../util/secrets";
import { hash as argon2idHash } from "./passwordHasher";
import type { SentEmail } from "../email/EmailTransport";

// ------------------------------------------------------------------
// Server connection
// ------------------------------------------------------------------

// The integration test server is started by jestIntegrationGlobalSetup.ts
// as a compiled child process (avoids Jest/ESM conflict with better-auth).
// Asserted as a definite string (IIFE) so hoisted helpers also see string.
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
// DB pool for direct inspection
// ------------------------------------------------------------------

const { username: testDbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const authPool = new Pool({ ...restTestDb, user: testDbUser, max: 2 });

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Insert a non-admin test user directly into the auth DB (sign-up is disabled). */
async function insertTestUser(email: string, password: string): Promise<string> {
  const passwordHash = await argon2idHash(password);
  const now = new Date();
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const client = await authPool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,$2,'TestUser',false,false,$3,$3)`,
      [userId, email.toLowerCase(), now],
    );
    await client.query(
      `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
       VALUES ($1,$2,$2,'credential',$3,$4,$4)`,
      [accountId, userId, passwordHash, now],
    );
  } finally {
    client.release();
  }
  return userId;
}

/** Return the current sentEmails buffer from the integration server. */
async function getSentEmails(): Promise<SentEmail[]> {
  const res = await agent().get("/api/test/sent-emails").expect(200);
  return res.body as SentEmail[];
}

/** Clear the integration server's sentEmails buffer. */
async function clearSentEmails(): Promise<void> {
  await agent().post("/api/test/clear-emails").expect(204);
}

/**
 * Poll /api/test/sent-emails until an email to `to` appears.
 * Throws if no email arrives within `maxWait` ms.
 * Necessary because sendResetPassword is fire-and-forget: the HTTP response
 * returns before the background task (throttle check → supersession → send)
 * has completed.
 */
async function waitForEmailTo(to: string, maxWait = 5_000): Promise<SentEmail> {
  const deadline = Date.now() + maxWait;
  while (Date.now() < deadline) {
    const emails = await getSentEmails();
    const found = emails.find((e) => e.to.toLowerCase() === to.toLowerCase());
    if (found) return found;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`No email to ${to} received within ${maxWait}ms`);
}

/**
 * Parse the reset token from the plain-text body of a password-reset email.
 * The link format (passwordResetEmail.ts) is:
 *   <baseUrl>/reset-password?token=<urlEncodedToken>
 */
function parseResetTokenFromEmail(email: SentEmail): string {
  const match = email.text.match(/[?&]token=([^\s&]+)/);
  if (!match) throw new Error(`No ?token= found in email text:\n${email.text}`);
  return decodeURIComponent(match[1]);
}

/**
 * Compute the per-address throttle key for a given email, mirroring the
 * computation in auth.ts sendResetPassword (data-model.md §rateLimit Pass 8/9).
 * Key = reset-req:<HMAC-SHA256(HMAC(cookieSecret,"reset-req-throttle"), email)>
 */
function computePerAddressThrottleKey(email: string): string {
  const subKey = createHmac("sha256", secrets.cookieSecret)
    .update("reset-req-throttle")
    .digest();
  const emailHash = createHmac("sha256", subKey)
    .update(email.toLowerCase())
    .digest("hex");
  return `reset-req:${emailHash}`;
}

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------

beforeEach(async () => {
  // Clear the server's in-process sentEmails buffer between tests.
  // DB table cleanup (verification, rateLimit, session, user, etc.) is handled
  // by the afterEach in jestSetupAfterEnv.ts.
  await clearSentEmails();
});

afterAll(async () => {
  await authPool.end();
});

// ------------------------------------------------------------------
// 1. Known email → 200 generic body, verification row in auth pool,
//    email captured by MemoryEmailTransport (not sent externally)
// ------------------------------------------------------------------

test(
  "POST /api/auth/request-password-reset with known email → 200 generic body, " +
    "verification row in auth pool (value=userId), email captured by MemoryEmailTransport",
  async () => {
    const email = "pr-known@example.com";
    const userId = await insertTestUser(email, "KnownPassword123!");

    const res = await agent()
      .post("/api/auth/request-password-reset")
      .send({ email })
      .expect(200);

    // Generic body — identical for known and unknown (FR-007/SC-004)
    expect(res.body.status).toBe(true);
    expect(typeof res.body.message).toBe("string");

    // Wait for the background task to complete (email sent via MemoryEmailTransport)
    const capturedEmail = await waitForEmailTo(email);

    // Email captured locally — not transmitted externally (FR-003)
    expect(capturedEmail.to).toBe(email);
    expect(capturedEmail.subject).toMatch(/password/i);
    // Plain-text body must contain the reset link
    expect(capturedEmail.text).toMatch(/reset-password\?token=/);

    // Verification row written in auth pool with value = userId
    // (data-model.md §verification: identifier=SHA256("reset-password:<token>"), value=userId)
    const client = await authPool.connect();
    try {
      const result = await client.query<{ value: string; expiresAt: Date }>(
        `SELECT value, "expiresAt" FROM "verification" WHERE value = $1`,
        [userId],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].value).toBe(userId);
      // expiresAt must be in the future (token is live, not expired)
      expect(new Date(result.rows[0].expiresAt).getTime()).toBeGreaterThan(Date.now());
    } finally {
      client.release();
    }
  },
);

// ------------------------------------------------------------------
// 2. Unknown email → 200 identical body, no verification row created,
//    response time does not materially differ (tolerance check, Pass 11)
// ------------------------------------------------------------------

test(
  "POST /api/auth/request-password-reset with unknown email → 200 identical body, " +
    "no verification row; response time does not materially differ from known-account path",
  async () => {
    const unknownEmail = "pr-unknown-ghost@example.com";
    const knownEmail = "pr-unknown-known@example.com";
    await insertTestUser(knownEmail, "KnownPassword123!");

    // Measure unknown-email response time
    const t0Unknown = Date.now();
    const resUnknown = await agent()
      .post("/api/auth/request-password-reset")
      .send({ email: unknownEmail })
      .expect(200);
    const tUnknown = Date.now() - t0Unknown;

    // Same generic body (FR-007/SC-004)
    expect(resUnknown.body.status).toBe(true);
    expect(typeof resUnknown.body.message).toBe("string");

    // No verification row created for a non-existent user
    const client = await authPool.connect();
    try {
      const result = await client.query(`SELECT COUNT(*) AS cnt FROM "verification"`);
      expect(Number(result.rows[0].cnt)).toBe(0);
    } finally {
      client.release();
    }

    // No email sent for the unknown address
    const emails = await getSentEmails();
    expect(emails.find((e) => e.to === unknownEmail)).toBeUndefined();

    // Measure known-email response time (the HTTP response itself, not background work)
    const t0Known = Date.now();
    await agent()
      .post("/api/auth/request-password-reset")
      .send({ email: knownEmail })
      .expect(200);
    const tKnown = Date.now() - t0Known;

    // Timing parity (Pass 11): the tolerance must exceed better-auth's own
    // INSERT-vs-SELECT residual floor. 1 second is generous; the assertion
    // prevents large, obviously wrong divergences (e.g., a sleep in one path).
    expect(Math.abs(tKnown - tUnknown)).toBeLessThan(1_000);
  },
);

// ------------------------------------------------------------------
// 3. Full reset flow — new password works, old password rejected,
//    all prior sessions invalidated
// ------------------------------------------------------------------

test(
  "Full reset: POST /reset-password with token from email → 200; " +
    "new password works; old password rejected; prior sessions invalidated",
  async () => {
    const email = "pr-fullreset@example.com";
    const oldPassword = "OldPassword123!";
    const newPassword = "NewPassword456!";

    await insertTestUser(email, oldPassword);

    // Establish a session that should be revoked after the reset (FR-009/SC-005)
    const priorSession = agent();
    const signInRes = await priorSession
      .post("/api/auth/sign-in/email")
      .send({ email, password: oldPassword })
      .expect(200);
    expect(signInRes.body.user).toBeDefined();

    // Request password reset
    await agent()
      .post("/api/auth/request-password-reset")
      .send({ email })
      .expect(200);

    // Obtain the token from the captured reset email
    const resetEmail = await waitForEmailTo(email);
    const token = parseResetTokenFromEmail(resetEmail);

    // Perform the password reset
    const resetRes = await agent()
      .post("/api/auth/reset-password")
      .send({ token, newPassword })
      .expect(200);
    expect(resetRes.body.status).toBe(true);

    // Old password must now be rejected (FR-009)
    await agent()
      .post("/api/auth/sign-in/email")
      .send({ email, password: oldPassword })
      .expect(401);

    // New password must work (FR-008)
    const newSignInRes = await agent()
      .post("/api/auth/sign-in/email")
      .send({ email, password: newPassword })
      .expect(200);
    expect(newSignInRes.body.user.email).toBe(email);

    // Prior session is revoked: get-session must return null (SC-005)
    const sessionCheck = await priorSession.get("/api/auth/get-session").expect(200);
    expect(sessionCheck.body).toBeNull();
  },
);

// ------------------------------------------------------------------
// 4. Consumed token → 400 INVALID_TOKEN
// ------------------------------------------------------------------

test("POST /api/auth/reset-password with already-consumed token → 400 INVALID_TOKEN", async () => {
  const email = "pr-consumed@example.com";
  await insertTestUser(email, "ConsumedPassword123!");

  // Request a reset and obtain the token
  await agent().post("/api/auth/request-password-reset").send({ email }).expect(200);
  const resetEmail = await waitForEmailTo(email);
  const token = parseResetTokenFromEmail(resetEmail);

  // First use: success
  await agent()
    .post("/api/auth/reset-password")
    .send({ token, newPassword: "NewPassword789!" })
    .expect(200);

  // Second use: token is consumed — must be rejected (FR-010/SC-006)
  const reUseRes = await agent()
    .post("/api/auth/reset-password")
    .send({ token, newPassword: "AnotherPassword1!" })
    .expect(400);
  expect(reUseRes.body.code).toBe("INVALID_TOKEN");
});

// ------------------------------------------------------------------
// 5. Expired token → 400 INVALID_TOKEN
// ------------------------------------------------------------------

test("POST /api/auth/reset-password with expired token → 400 INVALID_TOKEN", async () => {
  const email = "pr-expired@example.com";
  const userId = await insertTestUser(email, "ExpiredPassword123!");

  // Request a reset and obtain the token
  await agent().post("/api/auth/request-password-reset").send({ email }).expect(200);
  const resetEmail = await waitForEmailTo(email);
  const token = parseResetTokenFromEmail(resetEmail);

  // Force-expire the verification row by back-dating expiresAt
  // (mirroring the invitation expiry test pattern in invitation.integration.test.ts)
  const client = await authPool.connect();
  try {
    await client.query(
      `UPDATE "verification" SET "expiresAt" = NOW() - INTERVAL '2 hours' WHERE value = $1`,
      [userId],
    );
  } finally {
    client.release();
  }

  // Expired token must be rejected (FR-010)
  const res = await agent()
    .post("/api/auth/reset-password")
    .send({ token, newPassword: "NewPassword789!" })
    .expect(400);
  expect(res.body.code).toBe("INVALID_TOKEN");
});

// ------------------------------------------------------------------
// 6. Password too short → 400 PASSWORD_TOO_SHORT; password unchanged
// ------------------------------------------------------------------

test(
  "POST /api/auth/reset-password with 11-char password → 400 PASSWORD_TOO_SHORT; " +
    "original password remains valid",
  async () => {
    const email = "pr-short-pw@example.com";
    const originalPassword = "OriginalPassword123!";
    await insertTestUser(email, originalPassword);

    // Request a reset and obtain the token
    await agent().post("/api/auth/request-password-reset").send({ email }).expect(200);
    const resetEmail = await waitForEmailTo(email);
    const token = parseResetTokenFromEmail(resetEmail);

    // Attempt reset with 11-char password (below the 12-char minimum — FR-008)
    const shortPassword = "ElevenChars"; // exactly 11 characters
    const res = await agent()
      .post("/api/auth/reset-password")
      .send({ token, newPassword: shortPassword })
      .expect(400);
    expect(res.body.code).toBe("PASSWORD_TOO_SHORT");

    // Original password must still be accepted (password unchanged on policy rejection)
    const signInRes = await agent()
      .post("/api/auth/sign-in/email")
      .send({ email, password: originalPassword })
      .expect(200);
    expect(signInRes.body.user.email).toBe(email);
  },
);

// ------------------------------------------------------------------
// 7. Supersession — second request invalidates the first token
// ------------------------------------------------------------------

test(
  "Second /request-password-reset supersedes the first: " +
    "first token → 400 INVALID_TOKEN; second token → 200",
  async () => {
    const email = "pr-supersede@example.com";
    await insertTestUser(email, "SupersedePassword123!");

    // First reset request
    await agent().post("/api/auth/request-password-reset").send({ email }).expect(200);
    const email1 = await waitForEmailTo(email);
    const token1 = parseResetTokenFromEmail(email1);

    // Clear emails so we can cleanly poll for the second
    await clearSentEmails();

    // Second reset request — supersedes the first (spec §Edge Cases, Pass 2)
    await agent().post("/api/auth/request-password-reset").send({ email }).expect(200);
    const email2 = await waitForEmailTo(email);
    const token2 = parseResetTokenFromEmail(email2);

    // token1 must be rejected — superseded (prior row deleted by background task)
    const res1 = await agent()
      .post("/api/auth/reset-password")
      .send({ token: token1, newPassword: "NewPassword111!" })
      .expect(400);
    expect(res1.body.code).toBe("INVALID_TOKEN");

    // token2 must succeed — it is the live, un-superseded token
    const res2 = await agent()
      .post("/api/auth/reset-password")
      .send({ token: token2, newPassword: "NewPassword222!" })
      .expect(200);
    expect(res2.body.status).toBe(true);
  },
);

// ------------------------------------------------------------------
// 8. Per-address throttle — send suppressed, generic 200 returned,
//    prior verification row NOT deleted (Pass 5 — coupled supersession)
// ------------------------------------------------------------------

test(
  "Per-address throttle: beyond 3/60s per-address window → " +
    "send suppressed but generic 200 returned; prior verification row not deleted",
  async () => {
    const email = "pr-throttle@example.com";
    const userId = await insertTestUser(email, "ThrottlePassword123!");

    // First reset request: email sent, verification row created
    await agent().post("/api/auth/request-password-reset").send({ email }).expect(200);
    await waitForEmailTo(email); // wait for background task to complete

    // Directly override the per-address throttle counter to over-limit (>3)
    // within the current 60-second window. This triggers the per-address
    // suppression path on the next reset request, without triggering the
    // better-auth per-IP rate limit (we've only made 1 request from this IP so far).
    const throttleKey = computePerAddressThrottleKey(email);
    const client = await authPool.connect();
    try {
      // Delete any existing row for this key (from the 1st request's background task)
      await client.query(`DELETE FROM "rateLimit" WHERE key = $1`, [throttleKey]);
      // Insert an over-limit entry (count=10 >> max=3) within the current window
      await client.query(
        `INSERT INTO "rateLimit" (id, key, count, "lastRequest")
         VALUES (gen_random_uuid()::text, $1, 10, $2)`,
        [throttleKey, Date.now()],
      );
    } finally {
      client.release();
    }

    // Clear emails so we can verify NO new email arrives after the throttled request
    await clearSentEmails();

    // Second reset request: per-address throttle fires, send suppressed
    // Response must still be the generic 200 (enumeration-safe — FR-007)
    const throttledRes = await agent()
      .post("/api/auth/request-password-reset")
      .send({ email })
      .expect(200);
    expect(throttledRes.body.status).toBe(true);

    // Wait for the background task to complete (it will suppress the send, not
    // send an email). 2 seconds is conservative for local DB operations.
    await new Promise((r) => setTimeout(r, 2_000));

    // No new email must have been added (send suppressed — Pass 3)
    const emailsAfter = await getSentEmails();
    expect(emailsAfter).toHaveLength(0);

    // Prior verification row (from the 1st request) must NOT be deleted (Pass 5).
    // Throttled requests skip supersession and only delete the just-written row.
    const verifyResult = await authPool.query<{ value: string }>(
      `SELECT value FROM "verification" WHERE value = $1`,
      [userId],
    );
    expect(verifyResult.rows).toHaveLength(1);
  },
  10_000, // allow up to 10 s (2 s wait + DB + polling overhead)
);
