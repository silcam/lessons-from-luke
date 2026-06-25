/**
 * Controller tests for POST /api/admin/invitations, GET /api/auth/invitation/:token,
 * POST /api/auth/invitation/accept, GET /api/admin/invitations (list),
 * POST /api/admin/invitations/:id/retract, and GET /api/admin/invitations/:id/link.
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-012, §FR-013..FR-019, §FR-020
 * Plan: plan.md §Security Considerations (Pass 4 CSRF, Pass 1/2/12 rate-limit),
 *       contracts/invitation-api.yaml §/api/admin/invitations POST,
 *       §/api/admin/invitations GET, §/api/admin/invitations/{id}/retract POST,
 *       §/api/admin/invitations/{id}/link GET,
 *       §/api/auth/invitation/{token} GET, §/api/auth/invitation/accept POST
 *
 * These tests use the real test database via loggedInAgent() / plainAgent() from
 * testHelper.ts, consistent with existing controller tests.
 *
 * RED: the anonymous invitation routes (GET /api/auth/invitation/:token and
 * POST /api/auth/invitation/accept) do not yet exist — those tests should fail.
 * RED (US3): the admin list/retract/recopy routes do not yet exist — those tests
 * should also fail.
 */

/// <reference types="jest" />

import { Pool } from "pg";
import crypto from "crypto";
import { plainAgent, loggedInAgent } from "../testHelper";
import secrets from "../util/secrets";
import { createInvitation } from "../auth/invitationStore";

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

    const res = await agent.post("/api/admin/invitations").send({ email, role: "standard" });

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
    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 2. 201 — admin creates invitation with role 'admin'
  // -------------------------------------------------------------------------
  it("201: admin creates invitation with role 'admin'", async () => {
    const agent = await loggedInAgent();
    const email = `invited-admin-${crypto.randomUUID()}@example.com`;

    const res = await agent.post("/api/admin/invitations").send({ email, role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      role: "admin",
      status: "pending",
    });
    expect(res.header["cache-control"]).toBe("no-store");
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
    expect(res.body).toMatchObject({ error: expect.any(String), code: "INVALID_EMAIL" });
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
    expect(res.body).toMatchObject({ error: expect.any(String), code: "INVALID_ROLE" });
  });

  // -------------------------------------------------------------------------
  // 7b. 400 — malformed email rejected with INVALID_EMAIL code
  // -------------------------------------------------------------------------
  it("400: rejects a malformed email with code INVALID_EMAIL", async () => {
    const agent = await loggedInAgent();

    const res = await agent
      .post("/api/admin/invitations")
      .send({ email: "not-an-email", role: "standard" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String), code: "INVALID_EMAIL" });
  });

  // -------------------------------------------------------------------------
  // 8. 409 — email already has an account (FR-004 AccountAlreadyRegisteredError)
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
    expect(res.body).toMatchObject({ error: expect.any(String), code: "ACCOUNT_EXISTS" });
  });

  // -------------------------------------------------------------------------
  // 9. 409 — active pending invite already exists (FR-005 ActivePendingError)
  // -------------------------------------------------------------------------
  it("409: rejects when an active pending invitation already exists for this email (FR-005)", async () => {
    const agent = await loggedInAgent();
    const email = `pending-conflict-${crypto.randomUUID()}@example.com`;

    // Create the first invitation — should succeed
    const first = await agent.post("/api/admin/invitations").send({ email, role: "standard" });
    expect(first.status).toBe(201);

    // Create a second invitation for the same email — should conflict
    const second = await agent.post("/api/admin/invitations").send({ email, role: "admin" });

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ error: expect.any(String), code: "PENDING_INVITE_EXISTS" });
  });

  // -------------------------------------------------------------------------
  // 10. 429 — admin create route is rate-limited (security remediation: 9c7.12)
  //     The admin create endpoint exposes an account-enumeration oracle because
  //     it returns a distinct 409 ACCOUNT_EXISTS code for emails that already
  //     have accounts. Rate-limiting the route bounds enumeration speed.
  //     (BETTER_AUTH_ENFORCE_RATE_LIMIT=1 activates enforcement in test mode)
  // -------------------------------------------------------------------------
  it("429: per-IP rate limit exceeded after >10 admin create requests in 60s", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT;
    process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = "1";

    try {
      const agent = await loggedInAgent();

      let lastStatus = 0;
      // Make 12 requests — should hit the 429 limit (threshold ≤10)
      for (let i = 0; i < 12; i++) {
        const email = `rate-limit-admin-${crypto.randomUUID()}@example.com`;
        const res = await agent.post("/api/admin/invitations").send({ email, role: "standard" });
        lastStatus = res.status;
        if (lastStatus === 429) break;
      }

      expect(lastStatus).toBe(429);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = savedEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// Helper: create a pending invitation in the DB and return the plaintext token.
// Extracts the token from the link returned by createInvitation().
// ---------------------------------------------------------------------------

async function createPendingInvitation(
  pool: Pool,
  email: string,
  role: "standard" | "admin" = "standard"
): Promise<string> {
  // Look up the seeded admin user's ID — the migration creates it with a random
  // UUID, so we must query rather than hardcode.
  const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();
  const adminRow = await pool.query<{ id: string }>(
    `SELECT id FROM "user" WHERE LOWER(email) = $1 AND admin = true LIMIT 1`,
    [adminEmail]
  );
  const invitedBy = adminRow.rows[0]?.id ?? "unknown";

  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:8081";
  const result = await createInvitation(pool, {
    email: email.toLowerCase(),
    role,
    invitedBy,
    baseUrl,
    cookieSecret: secrets.cookieSecret,
  });
  // The link is <baseUrl>/invitation/<token> — extract the token from the path
  const url = new URL(result.link);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// ---------------------------------------------------------------------------
// GET /api/auth/invitation/:token — anonymous lookup
// ---------------------------------------------------------------------------

describe("GET /api/auth/invitation/:token", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — valid pending token → { email }, Cache-Control: no-store
  // -------------------------------------------------------------------------
  it("200: valid pending token returns { email } with Cache-Control: no-store", async () => {
    const agent = plainAgent();
    const email = `lookup-valid-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    const res = await agent.get(`/api/auth/invitation/${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: email.toLowerCase() });
    // role must NOT be in the response (dropped in Pass 7 — PII minimisation)
    expect(res.body).not.toHaveProperty("role");
    // Cache-Control: no-store (red-team Pass 7)
    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 2. 410 — unknown token → generic non-leaky error (FR-010)
  // -------------------------------------------------------------------------
  it("410: unknown token returns a generic non-leaky error (FR-010)", async () => {
    const agent = plainAgent();
    const unknownToken = crypto.randomBytes(32).toString("hex");

    const res = await agent.get(`/api/auth/invitation/${unknownToken}`);

    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 3. 429 — rate limit exceeded (BETTER_AUTH_ENFORCE_RATE_LIMIT=1, plan.md Pass 12)
  // -------------------------------------------------------------------------
  it("429: per-IP rate limit exceeded after >10 requests in 60s", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT;
    process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = "1";

    try {
      const agent = plainAgent();
      // Use a single token that will be unknown (we don't need it to be valid;
      // the rate limiter fires before the token lookup)
      const bogusToken = crypto.randomBytes(32).toString("hex");

      let lastStatus = 0;
      // Make 12 requests — should eventually hit the 429 limit (threshold ≤10)
      for (let i = 0; i < 12; i++) {
        const res = await agent.get(`/api/auth/invitation/${bogusToken}`);
        lastStatus = res.status;
        if (lastStatus === 429) break;
      }

      expect(lastStatus).toBe(429);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 4. The lookup GET is intentionally NOT origin-gated — read-only, no side
  //    effect, and its body is unreadable cross-origin (no CORS headers), so a
  //    forced cross-origin GET achieves nothing (plan.md Pass 4/11).
  //
  //    Regression test for the production 403: browsers omit Origin on a
  //    same-origin GET, and helmet's Referrer-Policy: no-referrer strips Referer,
  //    so requireSameOrigin had no signal and 403'd every real redemption. A
  //    lookup with NO Origin and NO Referer must succeed even under enforcement.
  // -------------------------------------------------------------------------
  it("200: valid token succeeds with NO Origin/Referer even when BETTER_AUTH_ENFORCE_ORIGIN=1 (prod redemption repro)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = plainAgent();
      const email = `lookup-no-origin-${crypto.randomUUID()}@example.com`;
      const token = await createPendingInvitation(authPool, email);

      // No .set("Origin", ...) and no Referer — exactly what a same-origin GET
      // looks like under Referrer-Policy: no-referrer in production.
      const res = await agent.get(`/api/auth/invitation/${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ email: email.toLowerCase() });
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/invitation/accept — anonymous accept
// ---------------------------------------------------------------------------

describe("POST /api/auth/invitation/accept", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — happy path: valid token + password ≥12 + name → account created
  // -------------------------------------------------------------------------
  it("200: valid token, password, and name creates an account with Cache-Control: no-store", async () => {
    const agent = plainAgent();
    const email = `accept-happy-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    const res = await agent
      .post("/api/auth/invitation/accept")
      .send({ token, password: "ValidPassword1!", name: "Test User" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: email.toLowerCase() });
    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 10. body parsing is available (req.body is parsed) — CRITICAL from plan.md
  //     Edge Cases "Route registration vs body parsing"
  // -------------------------------------------------------------------------
  it("body parsing is available: req.body is parsed (not undefined)", async () => {
    const agent = plainAgent();
    const email = `accept-bodyparsing-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    // A valid accept request should return 200 (not 400 "missing/invalid body"),
    // proving that req.body is actually parsed by the time the handler runs.
    const res = await agent
      .post("/api/auth/invitation/accept")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ token, password: "ValidPassword1!", name: "Body Parse Test" }));

    expect(res.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 2. 400 — password < 12 chars
  // -------------------------------------------------------------------------
  it("400: rejects password shorter than 12 characters", async () => {
    const agent = plainAgent();
    const email = `accept-shortpw-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    const res = await agent
      .post("/api/auth/invitation/accept")
      .send({ token, password: "Short1!", name: "Test User" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 3. 400 — name empty after trim
  // -------------------------------------------------------------------------
  it("400: rejects name that is empty after trim", async () => {
    const agent = plainAgent();
    const email = `accept-emptyname-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    const res = await agent
      .post("/api/auth/invitation/accept")
      .send({ token, password: "ValidPassword1!", name: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 4. 400 — name contains control characters
  // -------------------------------------------------------------------------
  it("400: rejects name containing control characters", async () => {
    const agent = plainAgent();
    const email = `accept-ctrlname-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    const res = await agent
      .post("/api/auth/invitation/accept")
      .send({ token, password: "ValidPassword1!", name: "Test\x01User" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 5. 400 — malformed JSON body → JSON 400, not HTML (plan.md Pass 8)
  // -------------------------------------------------------------------------
  it("400: malformed JSON body returns a JSON error response, not HTML (Pass 8)", async () => {
    const agent = plainAgent();

    const res = await agent
      .post("/api/auth/invitation/accept")
      .set("Content-Type", "application/json")
      .send("{invalid json{{");

    expect(res.status).toBe(400);
    // Must be JSON, not an HTML error page
    expect(res.header["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 6. 400 — oversized body (>4 kb) → JSON 400, not HTML (Pass 8, plan.md §bodyParser limit)
  // -------------------------------------------------------------------------
  it("400: oversized body (>4 kb) returns a JSON error response, not HTML (Pass 8)", async () => {
    const agent = plainAgent();

    // 5 kb string: 'a'.repeat(5 * 1024) wrapped in a JSON value exceeds the 4kb limit
    const oversizedValue = "a".repeat(5 * 1024);
    const oversizedBody = JSON.stringify({
      token: oversizedValue,
      password: "ValidPassword1!",
      name: "Test User",
    });

    const res = await agent
      .post("/api/auth/invitation/accept")
      .set("Content-Type", "application/json")
      .send(oversizedBody);

    expect(res.status).toBe(400);
    // Must be JSON, not an HTML error page
    expect(res.header["content-type"]).toMatch(/application\/json/);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 7. 403 — Origin not in allow-list (CSRF) when BETTER_AUTH_ENFORCE_ORIGIN=1
  // -------------------------------------------------------------------------
  it("403: foreign Origin header rejected when BETTER_AUTH_ENFORCE_ORIGIN=1", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = plainAgent();
      const email = `accept-csrf-${crypto.randomUUID()}@example.com`;
      const token = await createPendingInvitation(authPool, email);

      const res = await agent
        .post("/api/auth/invitation/accept")
        .set("Origin", "https://attacker.example.com")
        .send({ token, password: "ValidPassword1!", name: "CSRF Test" });

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 8. 410 — concurrent double-redemption: second attempt rejected (SC-003)
  // -------------------------------------------------------------------------
  it("410: concurrent double-redemption — second attempt is rejected (SC-003)", async () => {
    const email = `accept-double-${crypto.randomUUID()}@example.com`;
    const token = await createPendingInvitation(authPool, email);

    const agent1 = plainAgent();
    const agent2 = plainAgent();

    // Fire both redemptions concurrently
    const [res1, res2] = await Promise.all([
      agent1
        .post("/api/auth/invitation/accept")
        .send({ token, password: "ValidPassword1!", name: "User One" }),
      agent2
        .post("/api/auth/invitation/accept")
        .send({ token, password: "ValidPassword2!", name: "User Two" }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one succeeds (200); the loser is rejected by the single-use rule
    // with the same non-leaky 410 as any consumed/invalid link (FR-009, FR-010).
    // Its conditional UPDATE re-evaluates against the winner's committed 'accepted'
    // row and matches 0 rows → InvalidLinkError (410), never leaking that an
    // account now exists for the bound email.
    expect(statuses).toEqual([200, 410]);
  });

  // -------------------------------------------------------------------------
  // 9. 410 — invalid/expired/retracted token
  // -------------------------------------------------------------------------
  it("410: invalid token returns a generic non-leaky error (FR-010)", async () => {
    const agent = plainAgent();
    const bogusToken = crypto.randomBytes(32).toString("hex");

    const res = await agent
      .post("/api/auth/invitation/accept")
      .send({ token: bogusToken, password: "ValidPassword1!", name: "Test User" });

    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 10. 429 — rate limit (BETTER_AUTH_ENFORCE_RATE_LIMIT=1, plan.md Pass 12)
  // -------------------------------------------------------------------------
  it("429: per-IP rate limit exceeded after >10 accept requests in 60s", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT;
    process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = "1";

    try {
      const agent = plainAgent();
      const bogusToken = crypto.randomBytes(32).toString("hex");

      let lastStatus = 0;
      // Make 12 requests — should eventually hit the 429 limit (threshold ≤10)
      for (let i = 0; i < 12; i++) {
        const res = await agent
          .post("/api/auth/invitation/accept")
          .send({ token: bogusToken, password: "ValidPassword1!", name: "Test User" });
        lastStatus = res.status;
        if (lastStatus === 429) break;
      }

      expect(lastStatus).toBe(429);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT = savedEnv;
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/invitations — list all invitations (US3, FR-013, FR-014)
// ---------------------------------------------------------------------------

describe("GET /api/admin/invitations", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — authenticated admin → array of InvitationSummary; Cache-Control: no-store
  // -------------------------------------------------------------------------
  it("200: authenticated admin gets array of InvitationSummary with Cache-Control: no-store", async () => {
    const agent = await loggedInAgent();
    const email = `list-test-${crypto.randomUUID()}@example.com`;

    // Create an invitation so the list is non-empty
    await agent.post("/api/admin/invitations").send({ email, role: "standard" });

    const res = await agent.get("/api/admin/invitations");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // At least the one we just created
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    // Each item should have InvitationSummary fields
    const found = (res.body as Array<Record<string, unknown>>).find(
      (item) => item.email === email.toLowerCase()
    );
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      email: email.toLowerCase(),
      role: "standard",
      status: "pending",
    });
    expect(typeof found!.id).toBe("string");
    expect(typeof found!.createdAt).toBe("string");
    expect(typeof found!.invitedByEmail).toBe("string");
    // Cache-Control: no-store required (red-team Pass 10)
    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 2. 401 — unauthenticated
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();

    const res = await agent.get("/api/admin/invitations");

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 3. 403 — non-admin
  // -------------------------------------------------------------------------
  it("403: non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();

    const res = await agent.get("/api/admin/invitations");

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/invitations/:id/retract — retract a pending invitation (US3, FR-015)
// ---------------------------------------------------------------------------

describe("POST /api/admin/invitations/:id/retract", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — authenticated admin, pending invitation → Retracted, InvitationSummary; Cache-Control: no-store
  // -------------------------------------------------------------------------
  it("200: admin retracts pending invitation, returns InvitationSummary with Cache-Control: no-store", async () => {
    const agent = await loggedInAgent();
    const email = `retract-happy-${crypto.randomUUID()}@example.com`;

    // Create a pending invitation
    const createRes = await agent.post("/api/admin/invitations").send({ email, role: "standard" });
    expect(createRes.status).toBe(201);
    const invitationId = createRes.body.id as string;

    // Retract it
    const res = await agent.post(`/api/admin/invitations/${invitationId}/retract`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: invitationId,
      email: email.toLowerCase(),
      role: "standard",
      status: "retracted",
    });
    expect(typeof res.body.invitedByEmail).toBe("string");
    // Cache-Control: no-store required (red-team Pass 11)
    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 2. 401 — unauthenticated
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/invitations/${fakeId}/retract`);

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 3. 403 — non-admin
  // -------------------------------------------------------------------------
  it("403: non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/invitations/${fakeId}/retract`);

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 4. 403 — valid admin + Origin not in allow-list (CSRF defense, Pass 4)
  // -------------------------------------------------------------------------
  it("403: admin session with foreign Origin is rejected (CSRF defense)", async () => {
    const savedEnv = process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";

    try {
      const agent = await loggedInAgent();
      const fakeId = crypto.randomUUID();

      const res = await agent
        .post(`/api/admin/invitations/${fakeId}/retract`)
        .set("Origin", "https://attacker.example.com");

      expect(res.status).toBe(403);
    } finally {
      process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnv;
    }
  });

  // -------------------------------------------------------------------------
  // 5. 404 — invitation id not found
  // -------------------------------------------------------------------------
  it("404: unknown invitation id returns 404", async () => {
    const agent = await loggedInAgent();
    const nonExistentId = crypto.randomUUID();

    const res = await agent.post(`/api/admin/invitations/${nonExistentId}/retract`);

    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 6. 409 — invitation not pending (already accepted/retracted)
  // -------------------------------------------------------------------------
  it("409: retracting an already-retracted invitation returns 409", async () => {
    const agent = await loggedInAgent();
    const email = `retract-409-${crypto.randomUUID()}@example.com`;

    // Create a pending invitation
    const createRes = await agent.post("/api/admin/invitations").send({ email, role: "standard" });
    expect(createRes.status).toBe(201);
    const invitationId = createRes.body.id as string;

    // Retract it the first time — should succeed
    const firstRetract = await agent.post(`/api/admin/invitations/${invitationId}/retract`);
    expect(firstRetract.status).toBe(200);

    // Retract it again — should be 409 (not pending anymore)
    const secondRetract = await agent.post(`/api/admin/invitations/${invitationId}/retract`);

    expect(secondRetract.status).toBe(409);
    expect(secondRetract.body).toMatchObject({ error: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/invitations/:id/link — re-copy a pending invitation's link (US3, FR-016)
// ---------------------------------------------------------------------------

describe("GET /api/admin/invitations/:id/link", () => {
  // -------------------------------------------------------------------------
  // 1. 200 — authenticated admin, pending invitation → { link }; Cache-Control: no-store
  // -------------------------------------------------------------------------
  it("200: admin re-copies pending invitation link with Cache-Control: no-store", async () => {
    const agent = await loggedInAgent();
    const email = `link-happy-${crypto.randomUUID()}@example.com`;

    // Create a pending invitation
    const createRes = await agent.post("/api/admin/invitations").send({ email, role: "standard" });
    expect(createRes.status).toBe(201);
    const invitationId = createRes.body.id as string;
    const originalLink = createRes.body.link as string;

    // Re-copy the link
    const res = await agent.get(`/api/admin/invitations/${invitationId}/link`);

    expect(res.status).toBe(200);
    expect(typeof res.body.link).toBe("string");
    // Re-copy MUST return the SAME original link (no rotation — FR-016)
    expect(res.body.link).toBe(originalLink);
    // Cache-Control: no-store required (red-team Pass 7)
    expect(res.header["cache-control"]).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // 2. 401 — unauthenticated
  // -------------------------------------------------------------------------
  it("401: unauthenticated request is rejected", async () => {
    const agent = plainAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.get(`/api/admin/invitations/${fakeId}/link`);

    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // 3. 403 — non-admin
  // -------------------------------------------------------------------------
  it("403: non-admin session is rejected", async () => {
    const agent = await nonAdminAgent();
    const fakeId = crypto.randomUUID();

    const res = await agent.get(`/api/admin/invitations/${fakeId}/link`);

    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 4. 404 — invitation not found
  // -------------------------------------------------------------------------
  it("404: unknown invitation id returns 404", async () => {
    const agent = await loggedInAgent();
    const nonExistentId = crypto.randomUUID();

    const res = await agent.get(`/api/admin/invitations/${nonExistentId}/link`);

    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 5. 409 — invitation not pending (no link available)
  // -------------------------------------------------------------------------
  it("409: re-copying a retracted invitation's link returns 409", async () => {
    const agent = await loggedInAgent();
    const email = `link-409-${crypto.randomUUID()}@example.com`;

    // Create and then retract an invitation
    const createRes = await agent.post("/api/admin/invitations").send({ email, role: "standard" });
    expect(createRes.status).toBe(201);
    const invitationId = createRes.body.id as string;

    const retractRes = await agent.post(`/api/admin/invitations/${invitationId}/retract`);
    expect(retractRes.status).toBe(200);

    // Try to re-copy the link — should be 409 (not pending)
    const res = await agent.get(`/api/admin/invitations/${invitationId}/link`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });

  // -------------------------------------------------------------------------
  // 6. 409 — tokenEnc decrypt failure (wrong secret) → link unavailable, not 500
  // -------------------------------------------------------------------------
  it("409: decrypt failure (wrong cookieSecret) returns 409, not 500", async () => {
    // Insert a pending invitation directly with a garbage tokenEnc that will
    // fail decryption, to simulate a wrong-secret scenario.
    const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();
    const adminRow = await authPool.query<{ id: string }>(
      `SELECT id FROM "user" WHERE LOWER(email) = $1 AND admin = true LIMIT 1`,
      [adminEmail]
    );
    const invitedBy = adminRow.rows[0]?.id ?? "unknown";

    const invitationId = crypto.randomUUID();
    const email = `link-decrypt-fail-${crypto.randomUUID()}@example.com`;
    const tokenHash = crypto.randomBytes(32).toString("hex");
    const garbageTokenEnc = "bad:garbage:notbase64:invalid";
    const createdAt = new Date();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    await authPool.query(
      `INSERT INTO "invitation" (id, email, role, status, "tokenHash", "tokenEnc", "invitedBy", "createdAt", "expiresAt")
       VALUES ($1, $2, 'standard', 'pending', $3, $4, $5, $6, $7)`,
      [invitationId, email, tokenHash, garbageTokenEnc, invitedBy, createdAt, expiresAt]
    );

    const agent = await loggedInAgent();
    const res = await agent.get(`/api/admin/invitations/${invitationId}/link`);

    // Should return 409 (link unavailable due to decrypt error), NOT 500
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.any(String) });
  });
});
