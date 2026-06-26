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
 * - Any other email → admin: false, id: "nonadmin-<email-hash>"
 * This allows controller tests to distinguish admin vs non-admin sessions.
 */
"use strict";

// eslint-disable-next-line no-redeclare
var crypto = require("crypto");
var fs = require("fs");
var path = require("path");

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
              // Deterministic non-admin user ID based on email so the same email
              // always maps to the same "user" row in the mock.
              userId =
                "nonadmin-" +
                crypto.createHash("sha256").update(signingEmail).digest("hex").slice(0, 16);
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
        // Check Authorization: Bearer <token> first (simulates the bearer plugin).
        // The bearer token value is the same session token stored in the cookie,
        // so a successful sign-in's token works as both a cookie value and bearer.
        const authorization = context.headers && context.headers.get("authorization");
        if (authorization && authorization.toLowerCase().startsWith("bearer ")) {
          const bearerToken = authorization.slice(7).trim();
          const bearerData = sessions.get(bearerToken);
          if (bearerData) return bearerData;
        }

        // Fall back to cookie-based session lookup.
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
