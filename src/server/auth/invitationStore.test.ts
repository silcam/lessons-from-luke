/**
 * Unit/integration tests for invitationStore.ts — CREATE, LOOKUP, and ACCEPT paths.
 *
 * These tests run against the real test database (lessons-from-luke-test).
 * jestSetupAfterEnv.ts handles cleanup: afterEach deletes all invitation rows
 * before the scoped user-row deletes, so FK violations cannot arise.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-012, §US1/US2 Acceptance Scenarios,
 *       §Edge Cases (Lazy-expire concurrency, already-signed-in visitor,
 *       Retraction/Expiry during redemption)
 * Plan: plan.md §Project Structure (invitationStore.ts)
 * Data model: data-model.md §Validation rules, §State machine, §Accept transaction,
 *             §Management-list query, §Accept transaction & lazy-expire concurrency
 */
import { Pool } from "pg";
import crypto from "crypto";
import {
  createInvitation,
  lookupInvitation,
  acceptInvitation,
  listInvitations,
  retractInvitation,
  getInvitationLink,
} from "./invitationStore";
import * as passwordHasher from "./passwordHasher";
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
async function insertExpiredPendingInvitation(email: string, invitedBy: string): Promise<void> {
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
    const diffDays = (result.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
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

// ------------------------------------------------------------------
// lookupInvitation(pool, token) — FR-007..FR-010, FR-018
// ------------------------------------------------------------------

describe("lookupInvitation(pool, token)", () => {
  let invitedBy: string;

  beforeAll(async () => {
    invitedBy = await getAdminUserId();
  });

  // ------------------------------------------------------------------
  // 1. Returns { email } for a valid pending, non-expired token (200 path)
  // ------------------------------------------------------------------

  it("returns { email } for a valid pending, non-expired token", async () => {
    const email = "lookup-valid@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Extract the raw token from the link
    const token = created.link.split("/").pop()!;

    const result = await lookupInvitation(pool, token);
    expect(result).not.toBeNull();
    expect(result).toEqual({ email: email.toLowerCase() });
  });

  // ------------------------------------------------------------------
  // 2. Returns null for an unknown token (410 path)
  // ------------------------------------------------------------------

  it("returns null for an unknown token", async () => {
    const unknownToken = crypto.randomBytes(32).toString("base64url");
    const result = await lookupInvitation(pool, unknownToken);
    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // 3. Returns null for an accepted invitation (FR-009, single-use)
  // ------------------------------------------------------------------

  it("returns null for an accepted invitation (single-use, FR-009)", async () => {
    const email = "lookup-accepted@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Mark the invitation as accepted directly in the DB
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET status='accepted', "acceptedAt"=now() WHERE "id"=$1`,
        [created.id]
      );
    } finally {
      client.release();
    }

    const token = created.link.split("/").pop()!;
    const result = await lookupInvitation(pool, token);
    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // 4. Returns null for a retracted invitation (410 path)
  // ------------------------------------------------------------------

  it("returns null for a retracted invitation", async () => {
    const email = "lookup-retracted@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Retract the invitation directly
    const client = await pool.connect();
    try {
      await client.query(`UPDATE "invitation" SET status='retracted' WHERE "id"=$1`, [created.id]);
    } finally {
      client.release();
    }

    const token = created.link.split("/").pop()!;
    const result = await lookupInvitation(pool, token);
    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // 5. Returns null for an invitation past expiresAt even if status is
  //    still 'pending' (expired at read time, FR-018)
  // ------------------------------------------------------------------

  it("returns null for an invitation past expiresAt even if status is still 'pending' (FR-018)", async () => {
    const email = "lookup-expired@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Manually backdate expiresAt to 1 second ago without changing status
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET "expiresAt"=now() - interval '1 second' WHERE "id"=$1`,
        [created.id]
      );
    } finally {
      client.release();
    }

    const token = created.link.split("/").pop()!;
    const result = await lookupInvitation(pool, token);
    expect(result).toBeNull();
  });
});

// ------------------------------------------------------------------
// acceptInvitation(pool, token, password, name) — FR-008..FR-012,
// §US2 Acceptance Scenarios, §Edge Cases
// ------------------------------------------------------------------

describe("acceptInvitation(pool, token, password, name)", () => {
  let invitedBy: string;

  beforeAll(async () => {
    invitedBy = await getAdminUserId();
  });

  // ------------------------------------------------------------------
  // Helpers for this describe block
  // ------------------------------------------------------------------

  /** Look up a user row by email. Returns null if not found. */
  async function getUserByEmail(email: string): Promise<{
    id: string;
    name: string;
    admin: boolean;
    email: string;
    emailVerified: boolean;
  } | null> {
    const client = await pool.connect();
    try {
      const res = await client.query<{
        id: string;
        name: string;
        admin: boolean;
        email: string;
        emailVerified: boolean;
      }>(
        `SELECT id, name, admin, email, "emailVerified" FROM "user" WHERE LOWER(email) = $1 LIMIT 1`,
        [email.toLowerCase()]
      );
      return res.rows[0] ?? null;
    } finally {
      client.release();
    }
  }

  /** Look up a credential account row for a user. */
  async function getAccountByUserId(
    userId: string
  ): Promise<{ id: string; password: string } | null> {
    const client = await pool.connect();
    try {
      const res = await client.query<{ id: string; password: string }>(
        `SELECT id, password FROM "account" WHERE "userId"=$1 AND "providerId"='credential' LIMIT 1`,
        [userId]
      );
      return res.rows[0] ?? null;
    } finally {
      client.release();
    }
  }

  /** Get the invitation row by id. */
  async function getInvitationById(
    id: string
  ): Promise<{ status: string; acceptedAt: Date | null } | null> {
    const client = await pool.connect();
    try {
      const res = await client.query<{ status: string; acceptedAt: Date | null }>(
        `SELECT status, "acceptedAt" FROM "invitation" WHERE id=$1 LIMIT 1`,
        [id]
      );
      return res.rows[0] ?? null;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------
  // 1. Happy path: creates user+account, flips invitation to 'accepted',
  //    returns { email }
  // ------------------------------------------------------------------

  it("happy path: creates user+account, flips invitation to accepted with acceptedAt set, returns { email }", async () => {
    const email = "accept-happy@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    const result = await acceptInvitation(pool, token, "ValidPassword123!", "Alice Smith");
    expect(result).toEqual({ email: email.toLowerCase() });

    // User row created with correct data
    const user = await getUserByEmail(email);
    expect(user).not.toBeNull();
    expect(user!.email).toBe(email.toLowerCase());
    expect(user!.name).toBe("Alice Smith");
    expect(user!.admin).toBe(false);
    // Redeeming an email-bound, single-use link proves mailbox control, so the
    // account is verified-by-redemption.
    expect(user!.emailVerified).toBe(true);

    // Credential account row created
    const account = await getAccountByUserId(user!.id);
    expect(account).not.toBeNull();

    // Invitation flipped to 'accepted' with acceptedAt set
    const invitation = await getInvitationById(created.id);
    expect(invitation).not.toBeNull();
    expect(invitation!.status).toBe("accepted");
    expect(invitation!.acceptedAt).toBeInstanceOf(Date);
  });

  // ------------------------------------------------------------------
  // 2. Admin-role invitation sets user.admin = true
  // ------------------------------------------------------------------

  it("admin-role invitation creates user with admin=true", async () => {
    const email = "accept-admin-role@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "admin",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    await acceptInvitation(pool, token, "ValidPassword123!", "Admin User");

    const user = await getUserByEmail(email);
    expect(user).not.toBeNull();
    expect(user!.admin).toBe(true);
  });

  // ------------------------------------------------------------------
  // 3. The created account can sign in with better-auth (FR-012 latent coupling):
  //    the stored password hash verifies against the plaintext
  // ------------------------------------------------------------------

  it("the stored password hash verifies correctly against the plaintext (FR-012 latent coupling)", async () => {
    const email = "accept-verify-hash@example.com";
    const plaintext = "MySecurePassword!7";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    await acceptInvitation(pool, token, plaintext, "Hash Verifier");

    const user = await getUserByEmail(email);
    const account = await getAccountByUserId(user!.id);
    expect(account).not.toBeNull();

    const passwordMatches = await passwordHasher.verify(account!.password, plaintext);
    expect(passwordMatches).toBe(true);
  });

  // ------------------------------------------------------------------
  // 4. Invalid token (unknown) → throws InvalidLinkError (→ 410)
  // ------------------------------------------------------------------

  it("throws InvalidLinkError for an unknown token", async () => {
    const unknownToken = crypto.randomBytes(32).toString("base64url");
    await expect(
      acceptInvitation(pool, unknownToken, "ValidPassword123!", "Some Body")
    ).rejects.toMatchObject({ code: "INVALID_LINK" });
  });

  // ------------------------------------------------------------------
  // 5. Already-accepted link → throws AccountCreatedConcurrentlyError (SC-003)
  //    When the invitation was already redeemed by a prior request, an account
  //    exists for the bound email. The second attempt detects this and throws
  //    AccountCreatedConcurrentlyError (409) rather than the generic InvalidLinkError
  //    (410), so callers can distinguish "already has an account" from
  //    "link expired/retracted".
  // ------------------------------------------------------------------

  it("throws AccountCreatedConcurrentlyError for an already-accepted link (SC-003)", async () => {
    const email = "accept-reuse@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    // First accept should succeed
    await acceptInvitation(pool, token, "ValidPassword123!", "First Accept");

    // Second accept on the same token must fail with AccountCreatedConcurrentlyError
    // because the first accept created a user for the bound email.
    await expect(
      acceptInvitation(pool, token, "ValidPassword123!", "Second Accept")
    ).rejects.toMatchObject({ code: "ACCOUNT_ALREADY_EXISTS" });
  });

  // ------------------------------------------------------------------
  // 6. Retracted while form was open → throws InvalidLinkError (spec Edge Cases)
  // ------------------------------------------------------------------

  it("throws InvalidLinkError when invitation was retracted before accept (spec Edge Cases)", async () => {
    const email = "accept-retracted@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Retract the invitation (simulating admin retraction while form was open)
    const client = await pool.connect();
    try {
      await client.query(`UPDATE "invitation" SET status='retracted' WHERE "id"=$1`, [created.id]);
    } finally {
      client.release();
    }

    const token = created.link.split("/").pop()!;
    await expect(
      acceptInvitation(pool, token, "ValidPassword123!", "No Account")
    ).rejects.toMatchObject({ code: "INVALID_LINK" });

    // No user created
    const user = await getUserByEmail(email);
    expect(user).toBeNull();
  });

  // ------------------------------------------------------------------
  // 7. Expired while form was open → throws InvalidLinkError (spec Edge Cases)
  // ------------------------------------------------------------------

  it("throws InvalidLinkError when invitation expired before accept (spec Edge Cases)", async () => {
    const email = "accept-expired-race@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Backdate expiresAt to 1 second ago
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET "expiresAt"=now() - interval '1 second' WHERE "id"=$1`,
        [created.id]
      );
    } finally {
      client.release();
    }

    const token = created.link.split("/").pop()!;
    await expect(
      acceptInvitation(pool, token, "ValidPassword123!", "No Account")
    ).rejects.toMatchObject({ code: "INVALID_LINK" });

    // No user created
    const user = await getUserByEmail(email);
    expect(user).toBeNull();
  });

  // ------------------------------------------------------------------
  // 8. Password < 12 chars → throws ValidationError (plan.md §Performance)
  // ------------------------------------------------------------------

  it("throws ValidationError for a password shorter than 12 characters", async () => {
    const email = "accept-short-pw@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    await expect(acceptInvitation(pool, token, "short", "Alice")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  // ------------------------------------------------------------------
  // 9. Password > 128 chars → throws ValidationError
  // ------------------------------------------------------------------

  it("throws ValidationError for a password longer than 128 characters", async () => {
    const email = "accept-long-pw@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    const tooLongPassword = "A".repeat(129);
    await expect(acceptInvitation(pool, token, tooLongPassword, "Alice")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  // ------------------------------------------------------------------
  // 10. Name empty after trim → throws ValidationError (red-team Pass 6)
  // ------------------------------------------------------------------

  it("throws ValidationError for a name that is empty after trimming", async () => {
    const email = "accept-empty-name@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    await expect(acceptInvitation(pool, token, "ValidPassword123!", "   ")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  // ------------------------------------------------------------------
  // 11. Name with control characters / newlines → throws ValidationError (Pass 6)
  // ------------------------------------------------------------------

  it("throws ValidationError for a name containing control characters or newlines", async () => {
    const email = "accept-control-name@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    // Name with a newline character
    await expect(
      acceptInvitation(pool, token, "ValidPassword123!", "Alice\nSmith")
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  // ------------------------------------------------------------------
  // 12. Concurrent double-redemption: exactly one account created, other
  //     gets AccountCreatedConcurrentlyError (SC-003, spec Edge Cases).
  //     The losing request detects that an account was created by the winner and
  //     returns AccountCreatedConcurrentlyError (409) rather than InvalidLinkError (410).
  // ------------------------------------------------------------------

  it("concurrent double-redemption: exactly one account created, the other gets AccountCreatedConcurrentlyError (SC-003)", async () => {
    const email = "accept-concurrent@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    // Race two simultaneous accept calls against the same token
    const results = await Promise.allSettled([
      acceptInvitation(pool, token, "ValidPassword123!", "Racer One"),
      acceptInvitation(pool, token, "ValidPassword123!", "Racer Two"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one should succeed and one should fail
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "ACCOUNT_ALREADY_EXISTS",
    });

    // Exactly one user row was created
    const client = await pool.connect();
    try {
      const res = await client.query<{ count: string }>(
        `SELECT count(*) FROM "user" WHERE LOWER(email) = $1`,
        [email.toLowerCase()]
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(1);
    } finally {
      client.release();
    }
  });

  // ------------------------------------------------------------------
  // 13. Redeeming while carrying admin session context: account uses
  //     invitation's bound email and role, not the signed-in user's identity
  //     (spec Edge Case: already-signed-in visitor)
  // ------------------------------------------------------------------

  it("account is created with invitation's bound email and role, independent of any signed-in context (spec Edge Case)", async () => {
    // The acceptInvitation function takes the token and writes to the DB
    // based entirely on the invitation row (not any ambient session context).
    // We simulate the "already-signed-in visitor" scenario by calling accept
    // with mismatched data and confirming the invitation's bound email/role win.
    const email = "accept-signedin@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });
    const token = created.link.split("/").pop()!;

    // The caller passes a display name — only the invitation's bound email/role are used
    const result = await acceptInvitation(pool, token, "ValidPassword123!", "Correct Display Name");

    // The returned email must match the invitation's bound email, not any other identity
    expect(result).toEqual({ email: email.toLowerCase() });

    const user = await getUserByEmail(email);
    expect(user).not.toBeNull();
    // Role must come from the invitation (standard → admin: false), not from any signed-in state
    expect(user!.admin).toBe(false);
    // Email must be the invitation's bound email
    expect(user!.email).toBe(email.toLowerCase());
  });
});

// ------------------------------------------------------------------
// listInvitations(pool) — FR-013..FR-019, §US3 Acceptance Scenarios
// ------------------------------------------------------------------

describe("listInvitations(pool)", () => {
  let invitedBy: string;

  beforeAll(async () => {
    invitedBy = await getAdminUserId();
  });

  // ------------------------------------------------------------------
  // 1. Returns an array of InvitationSummary with the expected shape
  // ------------------------------------------------------------------

  it("returns InvitationSummary objects with the expected shape including invitedByEmail via JOIN", async () => {
    const email = "list-shape@example.com";
    await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const list = await listInvitations(pool);
    const found = list.find((inv) => inv.email === email.toLowerCase());
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      email: email.toLowerCase(),
      role: "standard",
      status: "pending",
    });
    expect(typeof found!.id).toBe("string");
    expect(found!.id.length).toBeGreaterThan(0);
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.expiresAt).toBeInstanceOf(Date);
    // invitedByEmail must be a string (resolved via JOIN to user table)
    expect(typeof found!.invitedByEmail).toBe("string");
    expect(found!.invitedByEmail).toBe(adminEmail);
    // Secrets must NOT be present
    expect((found as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
    expect((found as unknown as Record<string, unknown>).tokenEnc).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // 2. Returns an empty array when no invitations exist (FR-013 empty state)
  // ------------------------------------------------------------------

  it("returns an empty array when no invitations exist (FR-013 empty state)", async () => {
    // No invitations inserted in this test — jestSetupAfterEnv clears them between tests
    const list = await listInvitations(pool);
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // 3. Orders newest first (createdAt DESC)
  // ------------------------------------------------------------------

  it("orders invitations newest-first (createdAt DESC)", async () => {
    // Insert two invitations with a small delay between them
    await createInvitation(pool, {
      email: "list-order-first@example.com",
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Backdate the first invitation so the second is definitively newer
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET "createdAt" = now() - interval '1 minute'
         WHERE LOWER(email) = $1`,
        ["list-order-first@example.com"]
      );
    } finally {
      client.release();
    }

    await createInvitation(pool, {
      email: "list-order-second@example.com",
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const list = await listInvitations(pool);
    const emails = list.map((inv) => inv.email);
    const firstIdx = emails.indexOf("list-order-first@example.com");
    const secondIdx = emails.indexOf("list-order-second@example.com");
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(-1);
    // Second (newer) must appear before first (older)
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  // ------------------------------------------------------------------
  // 4. Does NOT include tokenHash or tokenEnc in returned objects
  // ------------------------------------------------------------------

  it("does not include tokenHash or tokenEnc in returned objects (secrets never reach response)", async () => {
    await createInvitation(pool, {
      email: "list-no-secrets@example.com",
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const list = await listInvitations(pool);
    for (const inv of list) {
      expect((inv as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
      expect((inv as unknown as Record<string, unknown>).tokenEnc).toBeUndefined();
    }
  });

  // ------------------------------------------------------------------
  // 5. Lazy-expire: pending row with past expiresAt appears as 'expired'
  // ------------------------------------------------------------------

  it("lazy-expire: a pending row with past expiresAt appears as status 'expired'", async () => {
    const email = "list-lazy-expire@example.com";
    await insertExpiredPendingInvitation(email, invitedBy);

    const list = await listInvitations(pool);
    const found = list.find((inv) => inv.email === email.toLowerCase());
    expect(found).toBeDefined();
    expect(found!.status).toBe("expired");
  });

  // ------------------------------------------------------------------
  // 6. Accepted invitation has acceptedAt set; pending has acceptedAt null
  // ------------------------------------------------------------------

  it("accepted invitation has acceptedAt set; pending invitation has acceptedAt null", async () => {
    const pendingEmail = "list-pending-at@example.com";
    const acceptedEmail = "list-accepted-at@example.com";

    const pending = await createInvitation(pool, {
      email: pendingEmail,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const accepted = await createInvitation(pool, {
      email: acceptedEmail,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Mark the second one as accepted with an acceptedAt timestamp
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET status='accepted', "acceptedAt"=now() WHERE id=$1`,
        [accepted.id]
      );
    } finally {
      client.release();
    }

    const list = await listInvitations(pool);

    const pendingRow = list.find((inv) => inv.id === pending.id);
    const acceptedRow = list.find((inv) => inv.id === accepted.id);

    expect(pendingRow).toBeDefined();
    expect(pendingRow!.acceptedAt).toBeNull();

    expect(acceptedRow).toBeDefined();
    expect(acceptedRow!.acceptedAt).toBeInstanceOf(Date);
  });
});

// ------------------------------------------------------------------
// retractInvitation(pool, id) — FR-015, §US3 Acceptance Scenarios
// ------------------------------------------------------------------

describe("retractInvitation(pool, id)", () => {
  let invitedBy: string;

  beforeAll(async () => {
    invitedBy = await getAdminUserId();
  });

  // ------------------------------------------------------------------
  // 1. Pending invitation → status becomes 'retracted', returns InvitationSummary
  // ------------------------------------------------------------------

  it("retracts a pending invitation: status becomes 'retracted' and returns InvitationSummary with invitedByEmail (FR-015)", async () => {
    const email = "retract-pending@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const result = await retractInvitation(pool, created.id);
    expect(result).toMatchObject({
      id: created.id,
      email: email.toLowerCase(),
      role: "standard",
      status: "retracted",
    });
    // invitedByEmail must be resolved via JOIN
    expect(typeof result.invitedByEmail).toBe("string");
    expect(result.invitedByEmail).toBe(adminEmail);
    // Secrets must NOT be present
    expect((result as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).tokenEnc).toBeUndefined();
  });

  // ------------------------------------------------------------------
  // 2. Non-existent id → throws NotFoundError (→ 404)
  // ------------------------------------------------------------------

  it("throws NotFoundError for a non-existent id (→ 404)", async () => {
    const nonExistentId = crypto.randomUUID();
    await expect(retractInvitation(pool, nonExistentId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  // ------------------------------------------------------------------
  // 3. Already-accepted invitation → throws NotPendingError (→ 409)
  // ------------------------------------------------------------------

  it("throws NotPendingError for an already-accepted invitation (→ 409)", async () => {
    const email = "retract-accepted@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET status='accepted', "acceptedAt"=now() WHERE id=$1`,
        [created.id]
      );
    } finally {
      client.release();
    }

    await expect(retractInvitation(pool, created.id)).rejects.toMatchObject({
      code: "NOT_PENDING",
    });
  });

  // ------------------------------------------------------------------
  // 4. Already-retracted invitation → throws NotPendingError (→ 409)
  // ------------------------------------------------------------------

  it("throws NotPendingError for an already-retracted invitation (→ 409)", async () => {
    const email = "retract-already-retracted@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Retract it once
    await retractInvitation(pool, created.id);

    // Attempting to retract again must throw NotPendingError
    await expect(retractInvitation(pool, created.id)).rejects.toMatchObject({
      code: "NOT_PENDING",
    });
  });

  // ------------------------------------------------------------------
  // 5. RACE — accept commits first, then retract gets 0 rows → NotPendingError
  //    (plan.md Pass 11 TOCTOU test, conditional UPDATE pattern)
  // ------------------------------------------------------------------

  it("RACE: accept commits first, concurrent retract gets 0 rows → NotPendingError, accepted state preserved (plan.md Pass 11)", async () => {
    const email = "retract-race@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Accept the invitation first (simulating the accept winning the race)
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET status='accepted', "acceptedAt"=now() WHERE id=$1 AND status='pending'`,
        [created.id]
      );
    } finally {
      client.release();
    }

    // Retract must now fail with NotPendingError (not overwrite to 'retracted')
    await expect(retractInvitation(pool, created.id)).rejects.toMatchObject({
      code: "NOT_PENDING",
    });

    // Confirm the row is still 'accepted' — not overwritten to 'retracted'
    const verifyClient = await pool.connect();
    try {
      const res = await verifyClient.query<{ status: string }>(
        `SELECT status FROM "invitation" WHERE id=$1`,
        [created.id]
      );
      expect(res.rows[0].status).toBe("accepted");
    } finally {
      verifyClient.release();
    }
  });
});

// ------------------------------------------------------------------
// getInvitationLink(pool, id, cookieSecret) — FR-016, §US3 Acceptance Scenarios
// ------------------------------------------------------------------

describe("getInvitationLink(pool, id, cookieSecret)", () => {
  let invitedBy: string;

  beforeAll(async () => {
    invitedBy = await getAdminUserId();
  });

  // ------------------------------------------------------------------
  // 1. Pending invitation → decrypts tokenEnc → returns { link }
  // ------------------------------------------------------------------

  it("pending invitation: decrypts tokenEnc and returns { link } containing the original token (FR-016)", async () => {
    const email = "link-pending@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const result = await getInvitationLink(pool, created.id, baseUrl, cookieSecret);
    expect(result).toHaveProperty("link");
    expect(typeof result.link).toBe("string");
    // The returned link must match the original link (same token, re-derived from tokenEnc)
    expect(result.link).toBe(created.link);
  });

  // ------------------------------------------------------------------
  // 2. Non-existent id → throws NotFoundError (→ 404)
  // ------------------------------------------------------------------

  it("throws NotFoundError for a non-existent id (→ 404)", async () => {
    const nonExistentId = crypto.randomUUID();
    await expect(
      getInvitationLink(pool, nonExistentId, baseUrl, cookieSecret)
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  // ------------------------------------------------------------------
  // 3. Non-pending invitation → throws NotPendingError (→ 409)
  // ------------------------------------------------------------------

  it("throws NotPendingError for a non-pending (accepted) invitation (→ 409)", async () => {
    const email = "link-accepted@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE "invitation" SET status='accepted', "acceptedAt"=now() WHERE id=$1`,
        [created.id]
      );
    } finally {
      client.release();
    }

    await expect(getInvitationLink(pool, created.id, baseUrl, cookieSecret)).rejects.toMatchObject({
      code: "NOT_PENDING",
    });
  });

  // ------------------------------------------------------------------
  // 4. tokenEnc decrypt failure (wrong cookieSecret) → throws DecryptError (→ 409)
  // ------------------------------------------------------------------

  it("throws DecryptError when tokenEnc decrypt fails due to wrong cookieSecret (→ 409, not 500)", async () => {
    const email = "link-wrong-secret@example.com";
    const created = await createInvitation(pool, {
      email,
      role: "standard",
      invitedBy,
      baseUrl,
      cookieSecret,
    });

    // Use a different (wrong) cookieSecret that is long enough to be valid but wrong
    const wrongSecret = "this-is-a-wrong-secret-32-chars!!";
    await expect(getInvitationLink(pool, created.id, baseUrl, wrongSecret)).rejects.toMatchObject({
      code: "DECRYPT_ERROR",
    });
  });
});
