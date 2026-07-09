/**
 * Unit tests for auth.ts — password reset wiring.
 *
 * RED state: ALL tests below FAIL against the current auth.ts because
 * sendResetPassword, onPasswordReset, and revokeSessionsOnPasswordReset
 * are not yet wired into getAuth().
 *
 * Coverage:
 * - revokeSessionsOnPasswordReset: true in emailAndPassword config (FR-009/SC-005)
 * - sendResetPassword wired and returns immediately (fire-and-forget, Pass 2/6)
 * - Background path issues supersession DELETE (value = userId) before send (Pass 2)
 * - Throttle over-limit: suppresses send, deletes just-written row, keeps prior rows (Pass 5)
 * - Throttle key = HMAC-SHA256(HMAC(cookieSecret,"reset-req-throttle"),canonicalEmail);
 *   two case variants of one address hit the same counter (Pass 8/9)
 * - rateLimit TTL cleanup scoped to 'reset-req:%' only; sign-in rows survive (Pass 10)
 * - onPasswordReset dispatches confirmation as fire-and-forget; throwing transport
 *   does not change the return value (Pass 4)
 *
 * Spec: specs/005-transactional-email-reset/contracts/auth-password-reset-api.yaml
 * Data model: data-model.md §verification (supersession, rateLimit)
 * Plan: plan.md §Security (Pass 2/4/5/6/8/9/10/11)
 */

import { createHash, createHmac } from "crypto";
import { Pool } from "pg";
import { getAuth, resetAuth } from "./auth";
import { setEmailTransport, resetEmailTransport } from "../email/getEmailTransport";
import type { EmailTransport } from "../email/EmailTransport";
import secrets from "../util/secrets";

// ---------------------------------------------------------------------------
// Test-DB pool for state assertions (same DB as jestSetupAfterEnv.ts).
// ---------------------------------------------------------------------------

const { username: dbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const testPool = new Pool({ ...restTestDb, user: dbUser, max: 2 });

afterAll(async () => {
  await testPool.end();
});

// Reset auth and email transport singletons for isolation.
beforeEach(() => {
  resetAuth();
});

afterEach(() => {
  resetAuth();
  resetEmailTransport();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the expected per-address throttle key.
 *
 * Key format: reset-req:<HMAC-SHA256(subKey, email.toLowerCase())>
 * Sub-key:    HMAC-SHA256(cookieSecret, "reset-req-throttle")
 *
 * Plan §Security, Pass 8/9 — keyed hash from existing cookieSecret,
 * canonical normalisation matches better-auth's email.toLowerCase() lookup.
 */
function expectedThrottleKey(email: string): string {
  const subKey = createHmac("sha256", secrets.cookieSecret).update("reset-req-throttle").digest();
  const hash = createHmac("sha256", subKey).update(email.toLowerCase()).digest("hex");
  return `reset-req:${hash}`;
}

/**
 * Hash a verification identifier for storeIdentifier:"hashed" storage.
 * better-auth hashes via SHA-256 then base64url-encodes without padding:
 *   base64url(SHA-256(identifier))
 * (src: better-auth/dist/db/verification-token-storage.mjs defaultKeyHasher)
 *
 * Node's Buffer.toString("base64url") matches @better-auth/utils/base64
 * base64Url.encode(new Uint8Array(hash), { padding: false }) exactly.
 */
function hashVerificationIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest().toString("base64url");
}

/**
 * Wait for background async chains to settle (DB round-trips, microtasks).
 * Used in tests where the transport is suppressed (no send-completion signal).
 */
async function waitForBackground(ms = 400): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: "auth-test-user-001",
  email: "TestReset@Example.com",
  name: "Test Reset User",
};

const MOCK_TOKEN = "mock-reset-token-abc789";

// ---------------------------------------------------------------------------
// Helper: safely extract the sendResetPassword callback from getAuth() options.
// ---------------------------------------------------------------------------

type SendResetPasswordArgs = {
  user: { id: string; email: string; name: string };
  url: string;
  token: string;
};

function getSendResetPassword(): ((args: SendResetPasswordArgs) => Promise<void>) | undefined {
  const auth = getAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ea = ((auth as any).options?.emailAndPassword ?? {}) as Record<string, unknown>;
  return ea.sendResetPassword as ((args: SendResetPasswordArgs) => Promise<void>) | undefined;
}

type OnPasswordResetArgs = {
  user: { id: string; email: string; name: string };
};

function getOnPasswordReset(): ((args: OnPasswordResetArgs) => Promise<void>) | undefined {
  const auth = getAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ea = ((auth as any).options?.emailAndPassword ?? {}) as Record<string, unknown>;
  return ea.onPasswordReset as ((args: OnPasswordResetArgs) => Promise<void>) | undefined;
}

// ===========================================================================
// revokeSessionsOnPasswordReset
// ===========================================================================

describe("getAuth() revokeSessionsOnPasswordReset", () => {
  it("emailAndPassword config includes revokeSessionsOnPasswordReset: true (FR-009/SC-005)", () => {
    const auth = getAuth();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ea = ((auth as any).options?.emailAndPassword ?? {}) as Record<string, unknown>;
    expect(ea.revokeSessionsOnPasswordReset).toBe(true);
  });
});

// ===========================================================================
// sendResetPassword callback
// ===========================================================================

describe("sendResetPassword", () => {
  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  it("is wired as emailAndPassword.sendResetPassword in getAuth() config", () => {
    expect(typeof getSendResetPassword()).toBe("function");
  });

  // -------------------------------------------------------------------------
  // Fire-and-forget timing (Pass 2 / Pass 6)
  // -------------------------------------------------------------------------

  it("returns immediately without awaiting the email send (Pass 2/6)", async () => {
    // Transport blocks until explicitly drained (drainChain()). This proves the
    // callback returns without awaiting send, AND prevents the background chain from
    // leaking into subsequent tests. Without draining, this test's chain ("chain A")
    // would reach getEmailTransport().send() lazily AFTER the supersession test sets
    // its own resolving transport, triggering sendDone prematurely before chain B's
    // DELETE has run (race condition observed when running auth tests with other files).
    let sendStarted = false;
    let drainChain!: () => void;
    const drainDone = new Promise<void>((resolve) => {
      drainChain = resolve;
    });
    const transport: EmailTransport = {
      send: jest.fn().mockImplementation(async () => {
        sendStarted = true;
        // Blocks until drainChain() is called below — never-resolving from the
        // callback's perspective, but manually released at test end so chain A
        // does not outlive this test.
        await drainDone;
      }),
    };
    setEmailTransport(transport);

    const callback = getSendResetPassword();
    expect(typeof callback).toBe("function");

    // This must resolve quickly (before the blocking transport).
    const start = Date.now();
    await callback!({ user: MOCK_USER, url: "http://ignored.example.com/", token: MOCK_TOKEN });
    const elapsed = Date.now() - start;

    // The synchronous body of sendResetPassword must return in <50 ms.
    // (The background chain has been dispatched but not awaited.)
    expect(elapsed).toBeLessThan(50);

    // send may or may not have been called yet (depends on microtask scheduling);
    // the important assertion is that the callback returned before it finished.
    void sendStarted; // referenced to suppress unused-variable lint

    // Drain chain A: unblock the send so the background IIFE can complete
    // (including rateLimit cleanup) before afterEach runs. Without this, chain A
    // can call the next test's transport and cause a non-deterministic failure.
    drainChain();
    await waitForBackground(400);
  });

  // -------------------------------------------------------------------------
  // Supersession — DELETE prior verification rows, keep just-written (Pass 2)
  // -------------------------------------------------------------------------

  it("supersession: deletes prior verification rows but preserves the just-written row (WHERE value=userId AND identifier!=justWritten) before send when not throttled (Pass 2)", async () => {
    // Signal from transport so we can wait for the background chain.
    let resolveSend!: () => void;
    const sendDone = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });
    const transport: EmailTransport = {
      send: jest.fn().mockImplementation(async () => {
        resolveSend();
      }),
    };
    setEmailTransport(transport);

    // Insert a prior un-consumed verification row for the user (to be superseded).
    // With storeIdentifier:"hashed" the identifier column stores a base64url(SHA-256) hash.
    const priorIdentifier = hashVerificationIdentifier("reset-password:prior-old-token");
    await testPool.query(
      `INSERT INTO "verification" (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW())`,
      ["verify-prior-sup-001", priorIdentifier, MOCK_USER.id]
    );

    // Also insert the "just-written" row (simulating better-auth's INSERT before
    // calling sendResetPassword). This row must SURVIVE the supersession DELETE.
    const justWrittenIdentifier = hashVerificationIdentifier(`reset-password:${MOCK_TOKEN}`);
    await testPool.query(
      `INSERT INTO "verification" (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW())`,
      ["verify-just-written-sup-001", justWrittenIdentifier, MOCK_USER.id]
    );

    const callback = getSendResetPassword();
    expect(typeof callback).toBe("function");

    await callback!({ user: MOCK_USER, url: "http://ignored/", token: MOCK_TOKEN });

    // Wait for the background task (includes the supersession DELETE + send).
    await sendDone;

    // Prior row must be deleted (supersession enforced).
    const priorRows = await testPool.query(`SELECT id FROM "verification" WHERE id = $1`, [
      "verify-prior-sup-001",
    ]);
    expect(priorRows.rows).toHaveLength(0);

    // Just-written row must SURVIVE — it holds the token that was just emailed.
    // (Prior impl deleted all rows; this is the bug fix: exclude justWrittenIdentifier.)
    const justWrittenRows = await testPool.query(`SELECT id FROM "verification" WHERE id = $1`, [
      "verify-just-written-sup-001",
    ]);
    expect(justWrittenRows.rows).toHaveLength(1);

    // Transport must have been called exactly once.
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Throttle coupled to supersession (Pass 5)
  // -------------------------------------------------------------------------

  it("when throttle over-limit: suppresses send, deletes just-written row, does NOT delete prior rows (Pass 5)", async () => {
    const transport: EmailTransport = {
      send: jest.fn(),
    };
    setEmailTransport(transport);

    const throttleKey = expectedThrottleKey(MOCK_USER.email);

    // Insert a prior un-consumed verification row for the user.
    const priorIdentifier = hashVerificationIdentifier("reset-password:prior-token-for-throttle");
    await testPool.query(
      `INSERT INTO "verification" (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW())`,
      ["verify-prior-thr-001", priorIdentifier, MOCK_USER.id]
    );

    // Insert the just-written verification row (better-auth wrote this immediately
    // before calling sendResetPassword). With storeIdentifier:"hashed", the
    // identifier is SHA-256("reset-password:" + token).
    const justWrittenIdentifier = hashVerificationIdentifier(`reset-password:${MOCK_TOKEN}`);
    await testPool.query(
      `INSERT INTO "verification" (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), NOW())`,
      ["verify-new-thr-001", justWrittenIdentifier, MOCK_USER.id]
    );

    // Put the per-address throttle counter over the limit.
    const nowMs = Date.now();
    await testPool.query(
      `INSERT INTO "rateLimit" (id, key, count, "lastRequest")
       VALUES ($1, $2, 999, $3)`,
      ["rl-throttle-001", throttleKey, nowMs]
    );

    const callback = getSendResetPassword();
    expect(typeof callback).toBe("function");

    await callback!({ user: MOCK_USER, url: "http://ignored/", token: MOCK_TOKEN });

    // Give the background chain time to run the throttle check + cleanup.
    await waitForBackground();

    // Send MUST be suppressed (throttle over limit).
    expect(transport.send).not.toHaveBeenCalled();

    // Prior row must NOT be deleted (no supersession on a suppressed/throttled request).
    const priorRows = await testPool.query(`SELECT id FROM "verification" WHERE id = $1`, [
      "verify-prior-thr-001",
    ]);
    expect(priorRows.rows).toHaveLength(1);

    // Just-written row MUST be deleted (to prevent it lingering to expiry).
    const newRows = await testPool.query(`SELECT id FROM "verification" WHERE id = $1`, [
      "verify-new-thr-001",
    ]);
    expect(newRows.rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // HMAC throttle key — no cleartext email, two case variants = same counter (Pass 8/9)
  // -------------------------------------------------------------------------

  it("throttle key is HMAC-SHA256(HMAC(cookieSecret,'reset-req-throttle'),canonicalEmail); two case variants hit the same counter and key contains no cleartext email (Pass 8/9)", async () => {
    const transport: EmailTransport = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    setEmailTransport(transport);

    const callback = getSendResetPassword();
    expect(typeof callback).toBe("function");

    const emailLower = "hmactest@example.com";
    const emailUpper = "HMACTEST@EXAMPLE.COM";
    const expectedKey = expectedThrottleKey(emailLower);

    const lowerUser = { ...MOCK_USER, email: emailLower };
    const upperUser = { ...MOCK_USER, email: emailUpper };

    // First call: lowercase email.
    await callback!({ user: lowerUser, url: "http://ignored/", token: MOCK_TOKEN + "-hmac1" });
    await waitForBackground();

    // The rateLimit table must have a row for the expected key.
    const rows1 = await testPool.query(`SELECT key, count FROM "rateLimit" WHERE key = $1`, [
      expectedKey,
    ]);
    expect(rows1.rows.length).toBeGreaterThanOrEqual(1);

    // Key must NOT contain cleartext email.
    const key1 = rows1.rows[0].key as string;
    expect(key1).not.toContain(emailLower);
    expect(key1).not.toContain(emailUpper);
    expect(key1).not.toContain("hmactest");
    expect(key1).not.toContain("HMACTEST");

    const count1 = Number(rows1.rows[0].count);

    // Second call: uppercase email — must hit the SAME key.
    await callback!({ user: upperUser, url: "http://ignored/", token: MOCK_TOKEN + "-hmac2" });
    await waitForBackground();

    const rows2 = await testPool.query(`SELECT key, count FROM "rateLimit" WHERE key = $1`, [
      expectedKey,
    ]);
    expect(rows2.rows.length).toBeGreaterThanOrEqual(1);
    // Counter must have incremented (same key for both case variants).
    expect(Number(rows2.rows[0].count)).toBeGreaterThan(count1);

    // There must be exactly ONE distinct reset-req: key (not two per case variant).
    const allKeys = await testPool.query(
      `SELECT DISTINCT key FROM "rateLimit" WHERE key LIKE 'reset-req:%'`
    );
    expect(allKeys.rows).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // TTL cleanup scope (Pass 10)
  // -------------------------------------------------------------------------

  it("rateLimit TTL cleanup uses 'reset-req:%' scope only — sign-in/email rows survive (Pass 10)", async () => {
    const transport: EmailTransport = {
      send: jest.fn().mockResolvedValue(undefined),
    };
    setEmailTransport(transport);

    // Insert a better-auth sign-in row with an old lastRequest that would be
    // deleted by a naive unscoped cleanup (it is past any reasonable window).
    const ipKey = "127.0.0.1:/sign-in/email";
    const oldTs = Date.now() - 200_000; // 200 s ago — older than any reset window
    await testPool.query(
      `INSERT INTO "rateLimit" (id, key, count, "lastRequest")
       VALUES ($1, $2, 1, $3)`,
      ["rl-signin-scope-001", ipKey, oldTs]
    );

    const callback = getSendResetPassword();
    expect(typeof callback).toBe("function");

    await callback!({ user: MOCK_USER, url: "http://ignored/", token: MOCK_TOKEN });
    await waitForBackground();

    // The sign-in/email row must NOT have been deleted by the reset-req cleanup.
    const signinRows = await testPool.query(`SELECT id FROM "rateLimit" WHERE key = $1`, [ipKey]);
    expect(signinRows.rows).toHaveLength(1);
  });
});

// ===========================================================================
// onPasswordReset callback
// ===========================================================================

describe("onPasswordReset", () => {
  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  it("is wired as emailAndPassword.onPasswordReset in getAuth() config", () => {
    expect(typeof getOnPasswordReset()).toBe("function");
  });

  // -------------------------------------------------------------------------
  // Fire-and-forget; throwing transport does not change return value (Pass 4)
  // -------------------------------------------------------------------------

  it("dispatches confirmation email as fire-and-forget; a throwing transport does not change the return value (Pass 4)", async () => {
    // Transport throws — must be swallowed, not propagated.
    const transport: EmailTransport = {
      send: jest.fn().mockRejectedValue(new Error("Confirmation transport failure")),
    };
    setEmailTransport(transport);

    const callback = getOnPasswordReset();
    expect(typeof callback).toBe("function");

    // Must resolve without throwing even though the transport throws.
    await expect(callback!({ user: MOCK_USER })).resolves.toBeUndefined();

    // Must also return quickly (not block on the failing transport).
    const start = Date.now();
    // Second call to measure return time (first already awaited above).
    await callback!({ user: MOCK_USER });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
