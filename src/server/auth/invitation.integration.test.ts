/**
 * Integration tests for the full invitation create → redeem → retract flow.
 *
 * These tests run against the real test database (lessons-from-luke-test)
 * via `yarn test:integration`. They exercise the real compiled server
 * (better-auth is ESM-only, hence the separate integration harness). The
 * INTEGRATION_SERVER_URL env var provides the base URL.
 *
 * Spec: specs/002-invitation-system/spec.md §SC-001..SC-009, §Edge Cases
 * Plan: plan.md §Project Structure (invitation.integration.test.ts),
 *       research.md §Cross-cutting: Testing strategy
 */
import request from "supertest";
import { Pool } from "pg";
import secrets from "../util/secrets";

// ------------------------------------------------------------------
// Server connection
// ------------------------------------------------------------------

// The integration test server is started by jestIntegrationGlobalSetup.ts
// as a compiled child process (avoids Jest/ESM conflict with better-auth).
// Asserted as a definite `string` (not merely CFA-narrowed by a guard) so the
// hoisted `function` declarations below — whose bodies TS analyzes without the
// post-guard narrowing in scope — also see `string`, not `string | undefined`.
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
const dbPool = new Pool({ ...restTestDb, user: testDbUser, max: 2 });

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const adminEmail = (secrets.adminEmail ?? "admin@example.com").toLowerCase();
const adminPassword = secrets.adminPassword;

async function signedInAdminAgent() {
  const a = agent();
  await a
    .post("/api/auth/sign-in/email")
    .send({ email: adminEmail, password: adminPassword })
    .expect(200);
  return a;
}

/**
 * Create an invitation as admin and return the full response body.
 */
async function adminCreateInvitation(
  email: string,
  role: "admin" | "standard" = "standard"
): Promise<{ id: string; link: string; email: string; role: string; status: string }> {
  const a = await signedInAdminAgent();
  const res = await a
    .post("/api/admin/invitations")
    .set("Origin", serverUrl)
    .send({ email, role })
    .expect(201);
  return res.body as { id: string; link: string; email: string; role: string; status: string };
}

/**
 * Extract the raw token from an invitation link.
 * Links have the shape <serverUrl>/invitation/<token>
 */
function extractToken(link: string): string {
  const parts = link.split("/invitation/");
  if (parts.length < 2) throw new Error(`Could not extract token from link: ${link}`);
  return parts[1];
}

// ------------------------------------------------------------------
// Lifecycle
// ------------------------------------------------------------------

afterAll(async () => {
  await dbPool.end();
});

// ------------------------------------------------------------------
// 1. Full create → redeem flow (SC-001, SC-002, FR-012)
// ------------------------------------------------------------------

test("Full create → lookup → accept → sign-in flow (FR-012 end-to-end, SC-001/SC-002)", async () => {
  const recipientEmail = "integration-recipient-1@example.com";
  const recipientPassword = "SecurePassword1!";
  const recipientName = "Integration Recipient";

  // Admin creates invitation
  const invitation = await adminCreateInvitation(recipientEmail, "standard");
  expect(invitation.status).toBe("pending");
  expect(invitation.email).toBe(recipientEmail);
  expect(invitation.link).toContain("/invitation/");

  const token = extractToken(invitation.link);

  // Recipient looks up the invitation (GET /api/auth/invitation/:token)
  const lookupRes = await agent()
    .get(`/api/auth/invitation/${token}`)
    .set("Origin", serverUrl)
    .expect(200);
  expect(lookupRes.header["cache-control"]).toBe("no-store");
  // Lookup response must contain email only (Pass 7 — role is NOT returned)
  expect(lookupRes.body.email).toBe(recipientEmail);
  expect(lookupRes.body.role).toBeUndefined();

  // Recipient accepts the invitation
  const acceptRes = await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: recipientPassword, name: recipientName })
    .expect(200);
  expect(acceptRes.header["cache-control"]).toBe("no-store");
  expect(acceptRes.body.email).toBe(recipientEmail);

  // The created account can sign in with the new credentials (FR-012)
  const signInRes = await agent()
    .post("/api/auth/sign-in/email")
    .send({ email: recipientEmail, password: recipientPassword })
    .expect(200);
  expect(signInRes.body.user).toBeDefined();
  expect(signInRes.body.user.email).toBe(recipientEmail);
  expect(signInRes.body.user.admin).toBe(false);

  // Account was created with the invitation's role (standard → admin: false)
  const client = await dbPool.connect();
  try {
    const userResult = await client.query<{ email: string; admin: boolean; name: string }>(
      `SELECT email, admin, name FROM "user" WHERE LOWER(email) = $1 LIMIT 1`,
      [recipientEmail]
    );
    expect(userResult.rows).toHaveLength(1);
    expect(userResult.rows[0].admin).toBe(false);
    expect(userResult.rows[0].name).toBe(recipientName);
  } finally {
    client.release();
  }
});

test("Admin-role invitation creates an admin account", async () => {
  const recipientEmail = "integration-admin-recipient@example.com";

  const invitation = await adminCreateInvitation(recipientEmail, "admin");
  const token = extractToken(invitation.link);

  await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Admin Recipient" })
    .expect(200);

  const client = await dbPool.connect();
  try {
    const result = await client.query<{ admin: boolean }>(
      `SELECT admin FROM "user" WHERE LOWER(email) = $1 LIMIT 1`,
      [recipientEmail]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].admin).toBe(true);
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// 2. Single-use: reusing an accepted link → 410 (SC-003)
// ------------------------------------------------------------------

test("Reusing an accepted invitation link → 410 (SC-003)", async () => {
  const recipientEmail = "integration-single-use@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);
  const token = extractToken(invitation.link);

  // First accept succeeds
  await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Single Use Test" })
    .expect(200);

  // Second lookup → 410 (link no longer valid)
  const lookupRes = await agent()
    .get(`/api/auth/invitation/${token}`)
    .set("Origin", serverUrl)
    .expect(410);
  expect(lookupRes.body.error).toBeDefined();

  // Second accept attempt → 410 (link no longer valid)
  const acceptRes = await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Single Use Test" })
    .expect(410);
  expect(acceptRes.body.error).toBeDefined();
});

// ------------------------------------------------------------------
// 3. Retract: admin creates → admin retracts → recipient GETs → 410 (SC-004)
// ------------------------------------------------------------------

test("Retract: admin retracts invitation → link stops working immediately (SC-004)", async () => {
  const recipientEmail = "integration-retract@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);
  const token = extractToken(invitation.link);

  // Admin retracts
  const adminAgent = await signedInAdminAgent();
  const retractRes = await adminAgent
    .post(`/api/admin/invitations/${invitation.id}/retract`)
    .set("Origin", serverUrl)
    .expect(200);
  expect(retractRes.header["cache-control"]).toBe("no-store");
  expect(retractRes.body.status).toBe("retracted");
  expect(retractRes.body.email).toBe(recipientEmail);

  // Recipient tries to look up the retracted link → 410
  await agent().get(`/api/auth/invitation/${token}`).set("Origin", serverUrl).expect(410);

  // Recipient tries to accept → 410
  await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Retract Test" })
    .expect(410);
});

// ------------------------------------------------------------------
// 4. Expiry: past expiresAt → link returns 410
// ------------------------------------------------------------------

test("Expired invitation link → 410", async () => {
  const recipientEmail = "integration-expired@example.com";

  // Create an invitation then backdated its expiresAt in the DB directly
  const invitation = await adminCreateInvitation(recipientEmail);
  const token = extractToken(invitation.link);

  // Force-expire the invitation by setting expiresAt in the past
  const client = await dbPool.connect();
  try {
    await client.query(
      `UPDATE "invitation" SET "expiresAt" = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [invitation.id]
    );
  } finally {
    client.release();
  }

  // Lookup → 410
  await agent().get(`/api/auth/invitation/${token}`).set("Origin", serverUrl).expect(410);

  // Accept → 410
  await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Expired Test" })
    .expect(410);
});

// ------------------------------------------------------------------
// 5. Rate limit: 11 rapid requests to GET /api/auth/invitation/:token → 429
// ------------------------------------------------------------------

test("Rate limit: 11 rapid requests to GET /api/auth/invitation/:token → 429", async () => {
  const recipientEmail = "integration-ratelimit@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);
  const token = extractToken(invitation.link);

  // Drive > 10 requests from the same agent to hit the per-IP limit
  let lastStatus = 0;
  for (let i = 0; i < 12; i++) {
    const res = await agent().get(`/api/auth/invitation/${token}`).set("Origin", serverUrl);
    lastStatus = res.status;
    if (lastStatus === 429) break;
  }
  expect(lastStatus).toBe(429);
});

// ------------------------------------------------------------------
// 5b. Rate limit keys on CF-Connecting-IP, not the edge / socket IP
// ------------------------------------------------------------------

test("Rate limit keys on CF-Connecting-IP: distinct client IPs are isolated, edge-IP collisions gone", async () => {
  // Behind Cloudflare both proxy hops APPEND to X-Forwarded-For, so req.ip is a
  // Cloudflare edge IP shared by many real clients. The limiter must instead key
  // on CF-Connecting-IP (the real, non-spoofable client IP). Two distinct
  // invitations are used so the lookup route's token-scoped SECONDARY key never
  // confounds the per-IP assertion (a reused token accumulates its own bucket
  // across IPs). 198.51.100.x is TEST-NET-2 (RFC 5737), standing in for clients.
  const invA = await adminCreateInvitation("integration-cfip-a@example.com");
  const invB = await adminCreateInvitation("integration-cfip-b@example.com");
  const tokenA = extractToken(invA.link);
  const tokenB = extractToken(invB.link);

  const clientIp1 = "198.51.100.10";
  const clientIp2 = "198.51.100.20";

  // 1. > 10 lookups of token-A from clientIp1 → 429. The bucket is keyed on
  //    CF-Connecting-IP — every request shares the same loopback socket IP, so
  //    if req.ip were the key this would still 429, hence steps 2–3 isolate it.
  let lastStatus = 0;
  for (let i = 0; i < 12; i++) {
    const res = await agent()
      .get(`/api/auth/invitation/${tokenA}`)
      .set("Origin", serverUrl)
      .set("CF-Connecting-IP", clientIp1);
    lastStatus = res.status;
    if (lastStatus === 429) break;
  }
  expect(lastStatus).toBe(429);

  // 2. A different CF-Connecting-IP is a SEPARATE bucket: one lookup of the
  //    (fresh) token-B from clientIp2 succeeds — not collateral-throttled.
  await agent()
    .get(`/api/auth/invitation/${tokenB}`)
    .set("Origin", serverUrl)
    .set("CF-Connecting-IP", clientIp2)
    .expect(200);

  // 3. It is the IP key — not the token — doing the throttling: the SAME fresh
  //    token-B from the already-throttled clientIp1 still 429s. Proves the 429
  //    in step 1 follows the CF-Connecting-IP value, not the shared socket IP
  //    or the token.
  await agent()
    .get(`/api/auth/invitation/${tokenB}`)
    .set("Origin", serverUrl)
    .set("CF-Connecting-IP", clientIp1)
    .expect(429);
});

// ------------------------------------------------------------------
// 6. CSRF: POST /api/auth/invitation/accept with wrong Origin → 403
// ------------------------------------------------------------------

test("CSRF: POST /api/auth/invitation/accept with wrong Origin → 403", async () => {
  const recipientEmail = "integration-csrf-anon@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);
  const token = extractToken(invitation.link);

  const res = await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", "https://evil.example.com")
    .send({ token, password: "SecurePassword1!", name: "CSRF Test" });

  expect(res.status).toBe(403);
});

// ------------------------------------------------------------------
// 6b. Redemption lookup with NO Origin/Referer → 200 (production repro)
//
// The lookup GET is intentionally un-gated: a same-origin GET sends no Origin,
// and helmet's Referrer-Policy: no-referrer strips Referer, so requireSameOrigin
// would have rejected every real redemption with a 403. This asserts the
// real compiled server (with live origin enforcement, per test 6) serves the
// lookup with neither header present.
// ------------------------------------------------------------------

test("Redemption lookup succeeds with NO Origin/Referer header (prod repro)", async () => {
  const recipientEmail = "integration-no-origin@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);
  const token = extractToken(invitation.link);

  // Deliberately set neither Origin nor Referer.
  const res = await agent().get(`/api/auth/invitation/${token}`);

  expect(res.status).toBe(200);
  expect(res.body.email).toBe(recipientEmail);
});

// ------------------------------------------------------------------
// 7. CSRF on admin POST: POST /api/admin/invitations with wrong Origin → 403
// ------------------------------------------------------------------

test("CSRF: POST /api/admin/invitations with wrong Origin → 403", async () => {
  const adminAgent = await signedInAdminAgent();

  const res = await adminAgent
    .post("/api/admin/invitations")
    .set("Origin", "https://evil.example.com")
    .send({ email: "some-csrf-victim@example.com", role: "standard" });

  expect(res.status).toBe(403);
});

// ------------------------------------------------------------------
// 8. Body parsing: malformed JSON to POST /api/auth/invitation/accept → JSON 400
// ------------------------------------------------------------------

test("Body parsing: malformed JSON to POST /api/auth/invitation/accept → JSON 400", async () => {
  const res = await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .set("Content-Type", "application/json")
    .send("{not valid json");

  expect(res.status).toBe(400);
  // Must be JSON, not HTML (plan.md Pass 8 — non-leaky JSON error)
  expect(res.header["content-type"]).toMatch(/application\/json/);
  expect(res.body).toBeDefined();
  expect(typeof res.body.error).toBe("string");
  // Must not contain a stack trace
  expect(JSON.stringify(res.body)).not.toMatch(/at Object\.|at Function\.|Error:/);
});

// ------------------------------------------------------------------
// 9. Re-copy: admin creates → admin re-copies link → same link (FR-016)
// ------------------------------------------------------------------

test("Re-copy: admin re-copies a pending invitation link → same link (FR-016)", async () => {
  const recipientEmail = "integration-recopy@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);
  const originalLink = invitation.link;

  const adminAgent = await signedInAdminAgent();
  const reCopyRes = await adminAgent
    .get(`/api/admin/invitations/${invitation.id}/link`)
    .expect(200);

  expect(reCopyRes.header["cache-control"]).toBe("no-store");
  expect(reCopyRes.body.link).toBe(originalLink);
});

// ------------------------------------------------------------------
// 10. Empty management list: GET /api/admin/invitations → [] (not error)
// ------------------------------------------------------------------

test("GET /api/admin/invitations with no invitations → empty array (not error)", async () => {
  // The jestSetupAfterEnv afterEach deletes all invitations between tests,
  // so this test starts with a clean slate.
  const adminAgent = await signedInAdminAgent();
  const res = await adminAgent.get("/api/admin/invitations").expect(200);

  expect(res.header["cache-control"]).toBe("no-store");
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body).toHaveLength(0);
});

// ------------------------------------------------------------------
// 11. Log redaction: unit-level assertion that the logger redacts /:token
// ------------------------------------------------------------------

test("Logger redaction: /invitation/<token> path is redacted to placeholder", () => {
  // Plan.md Pass 6/7: the real in-app leak is the SPA HTML route.
  // The logger regex must match /invitation/<token> and replace with [redacted].
  // We test the regex directly (plan.md Pass 7: unit-level, not via a live route,
  // because the SPA route only exists under NODE_ENV=production).
  const TOKEN_PATH_REDACT = /^\/(api\/auth\/)?invitation\/[^/]+$/;

  // Cases that MUST be redacted
  const redactCases = [
    "/invitation/abc123",
    "/invitation/some-very-long-base64url-token",
    "/api/auth/invitation/abc123",
    "/api/auth/invitation/some-token",
  ];
  for (const p of redactCases) {
    expect(TOKEN_PATH_REDACT.test(p)).toBe(true);
  }

  // Cases that must NOT be redacted (admin routes, other routes)
  const keepCases = [
    "/api/admin/invitations",
    "/api/admin/invitations/some-id/retract",
    "/api/admin/invitations/some-id/link",
    "/api/auth/sign-in/email",
    "/api/languages",
    "/invitation/", // empty token → no path segment
  ];
  for (const p of keepCases) {
    expect(TOKEN_PATH_REDACT.test(p)).toBe(false);
  }

  // Confirm the replacement produces the correct placeholder
  const rawPath = "/invitation/actual-secret-token";
  const logPath = TOKEN_PATH_REDACT.test(rawPath)
    ? rawPath.replace(/\/[^/]+$/, "/[redacted]")
    : rawPath;
  expect(logPath).toBe("/invitation/[redacted]");
  expect(logPath).not.toContain("actual-secret-token");
});

// ------------------------------------------------------------------
// 12. Cache-Control headers on all secret-bearing responses (plan.md Pass 7/8/10/11)
// ------------------------------------------------------------------

test("Cache-Control: no-store on all secret/PII-bearing responses", async () => {
  const recipientEmail = "integration-cache-control@example.com";

  // Create
  const adminAgent1 = await signedInAdminAgent();
  const createRes = await adminAgent1
    .post("/api/admin/invitations")
    .set("Origin", serverUrl)
    .send({ email: recipientEmail, role: "standard" })
    .expect(201);
  expect(createRes.header["cache-control"]).toBe("no-store");

  const invitationId: string = createRes.body.id;
  const token = extractToken(createRes.body.link);

  // Re-copy link
  const adminAgent2 = await signedInAdminAgent();
  const linkRes = await adminAgent2.get(`/api/admin/invitations/${invitationId}/link`).expect(200);
  expect(linkRes.header["cache-control"]).toBe("no-store");

  // List
  const adminAgent3 = await signedInAdminAgent();
  const listRes = await adminAgent3.get("/api/admin/invitations").expect(200);
  expect(listRes.header["cache-control"]).toBe("no-store");

  // Anonymous lookup
  const lookupRes = await agent()
    .get(`/api/auth/invitation/${token}`)
    .set("Origin", serverUrl)
    .expect(200);
  expect(lookupRes.header["cache-control"]).toBe("no-store");

  // Accept
  const acceptRes = await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Cache Test" })
    .expect(200);
  expect(acceptRes.header["cache-control"]).toBe("no-store");
});

test("Cache-Control: no-store on retract response (plan.md Pass 11)", async () => {
  const recipientEmail = "integration-retract-cache@example.com";

  const invitation = await adminCreateInvitation(recipientEmail);

  const adminAgent = await signedInAdminAgent();
  const retractRes = await adminAgent
    .post(`/api/admin/invitations/${invitation.id}/retract`)
    .set("Origin", serverUrl)
    .expect(200);
  expect(retractRes.header["cache-control"]).toBe("no-store");
});

// ------------------------------------------------------------------
// 13. Already-signed-in visitor redeems a link (plan.md Edge Cases)
// ------------------------------------------------------------------

test("Redemption ignores signed-in session — creates account for bound email, not session user", async () => {
  const boundEmail = "integration-bound-email@example.com";

  const invitation = await adminCreateInvitation(boundEmail, "standard");
  const token = extractToken(invitation.link);

  // Accept while carrying an admin session cookie — the resulting account must
  // use the bound email, not the signed-in admin's email.
  const adminAgent = await signedInAdminAgent();
  const acceptRes = await adminAgent
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token, password: "SecurePassword1!", name: "Bound Email Test" })
    .expect(200);

  // Confirmed: the new account uses the invitation's bound email
  expect(acceptRes.body.email).toBe(boundEmail);

  // The admin account still exists and only one new user was created
  const client = await dbPool.connect();
  try {
    const result = await client.query<{ email: string }>(
      `SELECT email FROM "user" WHERE LOWER(email) = $1`,
      [boundEmail]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].email).toBe(boundEmail);
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// 14. Management list accuracy (SC-005) — all states
// ------------------------------------------------------------------

test("Management list shows correct status for pending, retracted, and accepted invitations", async () => {
  const pendingEmail = "integration-list-pending@example.com";
  const retractedEmail = "integration-list-retracted@example.com";
  const acceptedEmail = "integration-list-accepted@example.com";

  // Create all three invitations
  const pending = await adminCreateInvitation(pendingEmail);
  const retractable = await adminCreateInvitation(retractedEmail);
  const acceptable = await adminCreateInvitation(acceptedEmail);

  // Retract one
  const adminAgent1 = await signedInAdminAgent();
  await adminAgent1
    .post(`/api/admin/invitations/${retractable.id}/retract`)
    .set("Origin", serverUrl)
    .expect(200);

  // Accept one
  const acceptToken = extractToken(acceptable.link);
  await agent()
    .post("/api/auth/invitation/accept")
    .set("Origin", serverUrl)
    .send({ token: acceptToken, password: "SecurePassword1!", name: "List Test" })
    .expect(200);

  // List should show all three
  const adminAgent2 = await signedInAdminAgent();
  const listRes = await adminAgent2.get("/api/admin/invitations").expect(200);

  const list: Array<{ id: string; status: string; email: string; invitedByEmail: string }> =
    listRes.body;

  const pendingEntry = list.find((i) => i.id === pending.id);
  const retractedEntry = list.find((i) => i.id === retractable.id);
  const acceptedEntry = list.find((i) => i.id === acceptable.id);

  expect(pendingEntry?.status).toBe("pending");
  expect(retractedEntry?.status).toBe("retracted");
  expect(acceptedEntry?.status).toBe("accepted");

  // invitedByEmail must be present (FR-017)
  expect(typeof pendingEntry?.invitedByEmail).toBe("string");
  expect(pendingEntry?.invitedByEmail).toBeTruthy();
});

// ------------------------------------------------------------------
// 15. Unauthenticated and non-admin access to admin routes → 401/403 (SC-007)
// ------------------------------------------------------------------

test("Unauthenticated access to POST /api/admin/invitations → 401", async () => {
  await agent()
    .post("/api/admin/invitations")
    .set("Origin", serverUrl)
    .send({ email: "new@example.com", role: "standard" })
    .expect(401);
});

test("Unauthenticated access to GET /api/admin/invitations → 401", async () => {
  await agent().get("/api/admin/invitations").expect(401);
});

// ------------------------------------------------------------------
// 16. Duplicate invitation rejection (FR-004, FR-005)
// ------------------------------------------------------------------

test("FR-004: duplicate account email → 409", async () => {
  // The admin account already exists — try to invite it
  const adminAgent = await signedInAdminAgent();
  const res = await adminAgent
    .post("/api/admin/invitations")
    .set("Origin", serverUrl)
    .send({ email: adminEmail, role: "standard" })
    .expect(409);
  expect(res.body.error).toBeDefined();
});

test("FR-005: re-inviting an open email refreshes it → 201, new link, old link dead (#115)", async () => {
  const sharedEmail = "integration-dup-pending@example.com";

  // First invitation succeeds
  const first = await adminCreateInvitation(sharedEmail);
  const firstToken = extractToken(first.link);

  // Re-inviting the same open email refreshes the invite → 201 with a new link
  const adminAgent = await signedInAdminAgent();
  const res = await adminAgent
    .post("/api/admin/invitations")
    .set("Origin", serverUrl)
    .send({ email: sharedEmail, role: "standard" })
    .expect(201);
  expect(res.body.status).toBe("pending");
  expect(res.body.link).not.toBe(first.link);

  const secondToken = extractToken(res.body.link);

  // The old link is dead; the refreshed link works
  await agent().get(`/api/auth/invitation/${firstToken}`).set("Origin", serverUrl).expect(410);
  await agent().get(`/api/auth/invitation/${secondToken}`).set("Origin", serverUrl).expect(200);
});
