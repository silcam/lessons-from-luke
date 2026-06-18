/**
 * Unit/integration tests for invitationStore.ts — CREATE path only.
 *
 * These tests run against the real test database (lessons-from-luke-test).
 * jestSetupAfterEnv.ts handles cleanup: afterEach deletes all invitation rows
 * before the scoped user-row deletes, so FK violations cannot arise.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-006, §US1 Acceptance Scenarios
 * Plan: plan.md §Project Structure (invitationStore.ts)
 * Data model: data-model.md §Validation rules, §State machine, §Accept transaction,
 *             §Management-list query
 */
import { Pool } from "pg";
import crypto from "crypto";
import { createInvitation } from "./invitationStore";
import secrets from "../util/secrets";

// ------------------------------------------------------------------
// Pool setup — mirrors auth.integration.test.ts and jestSetupAfterEnv.ts
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
const cookieSecret = secrets.cookieSecret;
const baseUrl = "http://localhost:8080";

/** Retrieve the admin user.id from the "user" table for use as invitedBy. */
async function getAdminUserId(): Promise<string> {
  const client = await pool.connect();
  try {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM "user" WHERE LOWER(email) = $1 LIMIT 1`,
      [adminEmail]
    );
    if (result.rows.length === 0) {
      throw new Error(`No admin user found with email ${adminEmail}`);
    }
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/** Insert a user row directly for duplicate-account tests. */
async function insertTestUser(email: string): Promise<string> {
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = new Date();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,$2,'TestUser',false,false,$3,$3)`,
      [userId, email.toLowerCase(), now]
    );
    await client.query(
      `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
       VALUES ($1,$2,$2,'credential','placeholder-hash',$3,$3)`,
      [accountId, userId, now]
    );
  } finally {
    client.release();
  }
  return userId;
}

/** Insert an expired pending invitation row directly for lazy-expire tests. */
async function insertExpiredPendingInvitation(
  email: string,
  invitedBy: string
): Promise<void> {
  const id = crypto.randomUUID();
  const tokenHash = crypto.randomBytes(32).toString("hex");
  const tokenEnc = "placeholder:placeholder:placeholder";
  const now = new Date();
  const expiredAt = new Date(now.getTime() - 1000); // 1 second ago
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO "invitation"
         ("id","email","role","status","tokenHash","tokenEnc","invitedBy","createdAt","expiresAt")
       VALUES ($1,$2,'standard','pending',$3,$4,$5,$6,$7)`,
      [id, email.toLowerCase(), tokenHash, tokenEnc, invitedBy, now, expiredAt]
    );
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("createInvitation(pool, input)", () => {
  let invitedBy: string;

  beforeAll(async () => {
    invitedBy = await getAdminUserId();
  });

  // ------------------------------------------------------------------
  // 1. Happy path: creates a pending row and returns the expected shape
  // ------------------------------------------------------------------

  it("creates a pending invitation row and returns the correct shape", async () => {
    const email = "newrecipient@example.com";
    const result = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    expect(result).toMatchObject({
      email: email.toLowerCase(),
      role: "standard",
      status: "pending",
    });
    expect(typeof result.id).toBe("string");
    expect(result.id.length).toBeGreaterThan(0);
    expect(typeof result.tokenHash).toBe("string");
    expect(result.tokenHash).toHaveLength(64); // SHA-256 hex
    expect(result.expiresAt).toBeInstanceOf(Date);
    // expiresAt should be roughly 14 days from now
    const diffDays =
      (result.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(13);
    expect(diffDays).toBeLessThan(15);
  });

  // ------------------------------------------------------------------
  // 2. Rejects when an account already exists for that email (FR-004)
  // ------------------------------------------------------------------

  it("rejects with 'account exists' error when email already has an account (FR-004)", async () => {
    const email = "existing-user@example.com";
    await insertTestUser(email);

    await expect(
      createInvitation(pool, {
        email,
        role: "standard",
        invitedBy,
        baseUrl,
        cookieSecret,
      })
    ).rejects.toMatchObject({ code: "ACCOUNT_EXISTS" });
  });

  // ------------------------------------------------------------------
  // 3. Rejects when a pending invite already exists for that email (FR-005)
  // ------------------------------------------------------------------

  it("rejects with 'active pending invite' error when pending invite already exists (FR-005)", async () => {
    const email = "pending-invite@example.com";
    // Create the first invitation (should succeed)
    await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Second invitation for same email must fail
    await expect(
      createInvitation(pool, {
        email,
        role: "admin",
        invitedBy,
        baseUrl,
        cookieSecret,
      })
    ).rejects.toMatchObject({ code: "PENDING_INVITE_EXISTS" });
  });

  // ------------------------------------------------------------------
  // 4. Allows creation when prior invite for same email is expired (FR-006)
  // ------------------------------------------------------------------

  it("allows creation when a prior invite for the same email is expired (FR-006)", async () => {
    const email = "expired-prior@example.com";
    await insertExpiredPendingInvitation(email, invitedBy);

    // Should succeed — the lazy-expire logic transitions the old row to 'expired'
    // before the partial-unique-pending index check
    const result = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    expect(result.email).toBe(email.toLowerCase());
    expect(result.status).toBe("pending");
  });

  // ------------------------------------------------------------------
  // 5. Rejects an email longer than 254 characters
  // ------------------------------------------------------------------

  it("rejects an email longer than 254 characters", async () => {
    const localPart = "a".repeat(245);
    const longEmail = `${localPart}@example.com`; // 257 chars
    expect(longEmail.length).toBeGreaterThan(254);

    await expect(
      createInvitation(pool, {
        email: longEmail,
        role: "standard",
        invitedBy,
        baseUrl,
        cookieSecret,
      })
    ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });

  // ------------------------------------------------------------------
  // 6. Rejects an invalid role
  // ------------------------------------------------------------------

  it("rejects an invalid role (not 'admin' or 'standard')", async () => {
    await expect(
      createInvitation(pool, {
        email: "someone@example.com",
        role: "superuser",
        invitedBy,
        baseUrl,
        cookieSecret,
      })
    ).rejects.toMatchObject({ code: "INVALID_ROLE" });
  });

  // ------------------------------------------------------------------
  // 7. Stores email in lowercase regardless of input case
  // ------------------------------------------------------------------

  it("stores email in lowercase regardless of input casing", async () => {
    const email = "MixedCase@EXAMPLE.COM";
    const result = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    expect(result.email).toBe(email.toLowerCase());
  });

  // ------------------------------------------------------------------
  // 8. On tokenHash collision (23505 on idx_invitation_tokenHash), retries once
  //    and does NOT map it to the FR-005 PENDING_INVITE_EXISTS error
  // ------------------------------------------------------------------

  it("retries on tokenHash collision without surfacing PENDING_INVITE_EXISTS", async () => {
    // We cannot easily force a SHA-256 collision, but we can verify that when
    // the store detects a 23505 on idx_invitation_tokenHash it retries rather
    // than erroring with PENDING_INVITE_EXISTS.
    //
    // Strategy: spy on generateToken to return a colliding hash on the first call,
    // then a unique one on the retry. This test verifies constraint-name
    // discrimination (plan.md Pass 11).
    //
    // Pre-insert an invitation with a known tokenHash to force the collision.
    const collidingTokenHash = crypto.randomBytes(32).toString("hex");
    const collidingId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO "invitation"
           ("id","email","role","status","tokenHash","tokenEnc","invitedBy","createdAt","expiresAt")
         VALUES ($1,'collision-seed@example.com','standard','pending',$2,'placeholder:placeholder:placeholder',$3,$4,$5)`,
        [collidingId, collidingTokenHash, invitedBy, now, expiresAt]
      );
    } finally {
      client.release();
    }

    // Mock generateToken and hashToken so the first attempt collides
    const invitationTokens = require("./invitationTokens");
    const originalGenerate = invitationTokens.generateToken;
    let callCount = 0;
    invitationTokens.generateToken = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        // Return a token whose hash we know already exists
        // We store the tokenHash but need the plaintext token to simulate the collision.
        // Since the store hashes the generated token, we need to intercept hashToken too.
        return "collision-token-first-attempt";
      }
      return originalGenerate();
    });
    const originalHash = invitationTokens.hashToken;
    invitationTokens.hashToken = jest.fn((token: string) => {
      if (token === "collision-token-first-attempt") {
        return collidingTokenHash;
      }
      return originalHash(token);
    });

    try {
      const result = await createInvitation(pool, {
        email: "retry-target@example.com",
        role: "standard",
        invitedBy,
        baseUrl,
        cookieSecret,
      });
      // Should succeed after retry — not throw PENDING_INVITE_EXISTS
      expect(result.email).toBe("retry-target@example.com");
      expect(result.status).toBe("pending");
    } finally {
      invitationTokens.generateToken = originalGenerate;
      invitationTokens.hashToken = originalHash;
    }
  });

  // ------------------------------------------------------------------
  // 9. Lazy-expire: expired pending row transitions to 'expired' before insert
  // ------------------------------------------------------------------

  it("handles lazy-expire: an expired pending row is transitioned to 'expired' before the insert", async () => {
    const email = "lazy-expire@example.com";
    await insertExpiredPendingInvitation(email, invitedBy);

    // Verify the old row is in the 'pending' state before the call
    const clientBefore = await pool.connect();
    let rowBefore;
    try {
      const res = await clientBefore.query(
        `SELECT status FROM "invitation" WHERE LOWER(email) = $1`,
        [email.toLowerCase()]
      );
      rowBefore = res.rows[0];
    } finally {
      clientBefore.release();
    }
    expect(rowBefore?.status).toBe("pending");

    // createInvitation should succeed (lazy-expire fires first)
    const result = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    expect(result.status).toBe("pending");

    // Verify the old row was transitioned to 'expired'
    const clientAfter = await pool.connect();
    try {
      const res = await clientAfter.query(
        `SELECT status FROM "invitation" WHERE LOWER(email) = $1 ORDER BY "createdAt" ASC`,
        [email.toLowerCase()]
      );
      // Two rows: the expired one (first, by createdAt) and the new pending one
      expect(res.rows.length).toBe(2);
      expect(res.rows[0].status).toBe("expired");
      expect(res.rows[1].status).toBe("pending");
    } finally {
      clientAfter.release();
    }
  });
});
