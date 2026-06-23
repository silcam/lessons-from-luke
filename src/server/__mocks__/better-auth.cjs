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
 * The simulated session returns an admin user so loggedInAgent() in testHelper.ts
 * works correctly in unit tests (controller tests, etc.).
 */
"use strict";

// eslint-disable-next-line no-redeclare
var crypto = require("crypto");

// In-memory session store for unit test simulation
const sessions = new Map();

const COOKIE_NAME = "better-auth.session_token";

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
        // Any sign-in attempt in unit tests succeeds and returns an admin session
        const sessionToken = crypto.randomUUID();
        sessions.set(sessionToken, {
          session: {
            id: "sess-" + sessionToken.slice(0, 8),
            userId: "user-test-id",
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
          user: {
            id: "user-test-id",
            email: "admin@example.com",
            name: "Admin",
            admin: true,
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
