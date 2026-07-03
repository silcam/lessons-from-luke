/**
 * CJS shim for the `better-auth` package (unit-test context only).
 *
 * better-auth is an ESM-only package. Jest's CJS runner cannot load it directly.
 * This shim provides a minimal auth simulation for UNIT tests so that:
 * - POST /api/auth/sign-in/email creates a session cookie
 * - GET /api/auth/get-session returns session data when the cookie is present
 * - POST /api/auth/sign-out clears the session cookie
 *
 * Integration tests use the real better-auth via a compiled child-process server
 * (see jestIntegrationGlobalSetup.ts) and do NOT use this shim.
 *
 * Sign-in uses the email from the request body to determine admin status:
 * - The admin email from secrets.json → admin: true, id: "user-test-id"
 * - Any other email with a matching real "user" row (controller tests always
 *   INSERT one directly before signing in, since sign-up is disabled) → the
 *   REAL id/admin/deactivatedAt from that row. This keeps the mock session's
 *   user id in sync with the real "user" table so requireUser.ts's
 *   deactivatedAt enforcement (US2/FR-005) can look it up correctly.
 * - Any other email with no matching row → a deterministic fallback id
 *   ("nonadmin-<email-hash>"), admin: false, for tests that only exercise
 *   sign-in itself without a pre-inserted row.
 */
"use strict";

// eslint-disable-next-line no-redeclare
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");
var { Pool } = require("pg");

// In-memory session store for unit test simulation
const sessions = new Map();

const COOKIE_NAME = "better-auth.session_token";

// The fixed mock user ID used for the admin session — must match the row seeded
// in jestSetupAfterEnv.ts so that invitation.invitedBy FK is satisfied.
const ADMIN_MOCK_USER_ID = "user-test-id";

// Load admin email from secrets.json to distinguish admin vs non-admin sign-ins.
// Fall back gracefully if secrets.json is not readable (e.g., CI without secrets).
function getAdminEmail() {
  try {
    const secretsPath = path.resolve(process.cwd(), "secrets.json");
    const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    return (secrets.adminEmail || "admin@example.com").toLowerCase();
  } catch {
    return "admin@example.com";
  }
}

const ADMIN_EMAIL = getAdminEmail();

// Lazily-created pg.Pool pointed at the real test database, used ONLY to look
// up a real "user" row's id/admin/deactivatedAt at sign-in time (see
// lookupRealUser() below) so the mock session stays in sync with rows the
// controller tests INSERT directly (sign-up is disabled globally). Mirrors
// the credential-remapping pattern in auth.ts's getAuthPool().
let dbPool = null;
function getDbPool() {
  if (dbPool) return dbPool;
  try {
    const secretsPath = path.resolve(process.cwd(), "secrets.json");
    const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    const { username, ...rest } = secrets.testDb;
    dbPool = new Pool({ ...rest, user: username, max: 2 });
    // pg.Pool emits "error" for background client errors (e.g. an idle
    // connection reset by Postgres). Without a listener, that would throw
    // an uncaught exception and crash the whole (single, shared) Jest
    // worker process — taking down every other test file with it. This is
    // a no-op safety net only; lookupRealUser() below independently
    // catches query-level failures and falls back to the synthetic id.
    dbPool.on("error", () => {});
  } catch {
    dbPool = null;
  }
  return dbPool;
}

/**
 * Looks up a real "user" row by email (controller tests always INSERT one
 * directly before signing in a non-admin agent, since sign-up is disabled).
 * Returns null if not found or on any lookup error — callers fall back to
 * the synthetic id/admin defaults in that case.
 */
async function lookupRealUser(email) {
  const pool = getDbPool();
  if (!pool) return null;
  try {
    const result = await pool.query(
      `SELECT id, admin, "deactivatedAt" FROM "user" WHERE LOWER(email) = $1`,
      [email]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((c) => c.trim().split("=").map(decodeURIComponent))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k.trim(), v.join("=").trim()])
  );
}

/**
 * Stub betterAuth factory. Returns an auth instance with a minimal handler
 * that simulates sign-in/session/sign-out for unit tests.
 */
function betterAuth(config) {
  const stub = {
    handler: async (request) => {
      const url = new URL(request.url);
      const path = url.pathname;

      // POST /api/auth/sign-in/email → create a session
      if (path.endsWith("/sign-in/email") && request.method === "POST") {
        // Parse the email from the request body to determine admin status
        let signingEmail = ADMIN_EMAIL; // default to admin
        let isAdmin = true;
        let userId = ADMIN_MOCK_USER_ID;

        try {
          const bodyText = await request.text();
          const body = JSON.parse(bodyText);
          if (body.email && typeof body.email === "string") {
            signingEmail = body.email.toLowerCase();
            isAdmin = signingEmail === ADMIN_EMAIL;
            if (!isAdmin) {
              // Prefer the REAL "user" row's id/admin if one exists (controller
              // tests always INSERT one directly before signing in, since
              // sign-up is disabled) so requireUser.ts's deactivatedAt lookup
              // (US2/FR-005) resolves against the row that's actually there.
              const realUser = await lookupRealUser(signingEmail);
              if (realUser) {
                userId = realUser.id;
                isAdmin = Boolean(realUser.admin);
              } else {
                // Fallback: deterministic non-admin user ID based on email so
                // the same email always maps to the same synthetic id.
                userId =
                  "nonadmin-" +
                  crypto.createHash("sha256").update(signingEmail).digest("hex").slice(0, 16);
              }
            }
          }
        } catch {
          // Body parse failure → fall back to admin mock
        }

        const sessionToken = crypto.randomUUID();
        sessions.set(sessionToken, {
          session: {
            id: "sess-" + sessionToken.slice(0, 8),
            userId,
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
          user: {
            id: userId,
            email: signingEmail,
            name: isAdmin ? "Admin" : "Non-Admin",
            admin: isAdmin,
            emailVerified: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        const headers = new Headers({
          "Content-Type": "application/json",
          "Set-Cookie": `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly`,
        });
        return new Response(
          JSON.stringify({
            session: sessions.get(sessionToken).session,
            user: sessions.get(sessionToken).user,
          }),
          { status: 200, headers }
        );
      }

      // GET /api/auth/get-session → return session if cookie present
      if (path.endsWith("/get-session") && request.method === "GET") {
        const cookies = parseCookies(request.headers.get("cookie") || "");
        const token = cookies[COOKIE_NAME];
        const data = token ? sessions.get(token) : null;
        return new Response(JSON.stringify(data || null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // POST /api/auth/sign-out → clear session
      if (path.endsWith("/sign-out") && request.method === "POST") {
        const cookies = parseCookies(request.headers.get("cookie") || "");
        const token = cookies[COOKIE_NAME];
        if (token) sessions.delete(token);
        const headers = new Headers({
          "Content-Type": "application/json",
          "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0`,
        });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers });
      }

      // Default: return 404 for unknown routes
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },

    api: {
      getSession: async (context) => {
        const cookie = context.headers && context.headers.get("cookie");
        const cookies = parseCookies(cookie || "");
        const token = cookies[COOKIE_NAME];
        if (!token) return null;
        const data = sessions.get(token);
        return data || null;
      },
    },

    options: config || {},
    $ERROR_CODES: {},
    $context: Promise.resolve({}),
  };

  return stub;
}

module.exports = { betterAuth };
