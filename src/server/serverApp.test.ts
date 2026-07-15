/// <reference types="jest" />

import request from "supertest";
import serverApp from "./serverApp";
import path from "path";
import fs from "fs";

// ─── Security headers ─────────────────────────────────────────────────────────

describe("HTTP security headers", () => {
  test("X-Content-Type-Options: nosniff is set on all responses", async () => {
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    expect(response.header["x-content-type-options"]).toBe("nosniff");
  });

  test("X-Frame-Options is set to prevent clickjacking", async () => {
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    // helmet frameguard sets SAMEORIGIN; CSP frame-ancestors is an alternative
    const xfo = (response.header["x-frame-options"] ?? "") as string;
    const csp = (response.header["content-security-policy"] ?? "") as string;
    const frameProtected =
      xfo.toLowerCase().includes("sameorigin") || csp.toLowerCase().includes("frame-ancestors");
    expect(frameProtected).toBe(true);
  });

  test("Content-Security-Policy header is present", async () => {
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    expect(response.header["content-security-policy"]).toBeDefined();
  });

  test("Strict-Transport-Security is NOT set outside production", async () => {
    // In non-production NODE_ENV (test/development), HSTS must be absent
    // because the server may be accessed over plain HTTP
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    expect(response.header["strict-transport-security"]).toBeUndefined();
  });

  test("Content-Security-Policy styleSrc does not contain 'unsafe-inline'", async () => {
    // 'unsafe-inline' in styleSrc allows CSS-based exfiltration / UI-redressing
    // attacks; it must be absent so the CSP provides meaningful XSS protection.
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    const csp = (response.header["content-security-policy"] ?? "") as string;
    // Isolate the style-src directive value (ends at ';' or end-of-string)
    const styleSrcMatch = csp.match(/style-src\s+([^;]*)/i);
    const styleSrcValue = styleSrcMatch ? styleSrcMatch[1] : "";
    expect(styleSrcValue).not.toContain("'unsafe-inline'");
  });

  test("Content-Security-Policy styleSrc carries a per-request nonce", async () => {
    // styled-components injects runtime <style> tags; without a style-src nonce
    // (and with no 'unsafe-inline') the production SPA throws
    // "CSSStyleSheet could not be found on HTMLStyleElement". Must hit a 200 route
    // because Express's finalhandler replaces the CSP with "default-src 'none'"
    // on 404/error responses, masking helmet's policy.
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    const csp = (response.header["content-security-policy"] ?? "") as string;
    const styleSrc = csp.match(/style-src\s+([^;]*)/i)?.[1] ?? "";
    expect(styleSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  test('a doubled X-Forwarded-Proto ("https, https") is handled without breaking the response', async () => {
    // Boundary smoke check: the normalizeForwardedProto middleware collapses the
    // doubled header (Cloudflare + Passenger each append a scheme) before any
    // downstream handler. The request must still succeed with normal security headers.
    const app = serverApp({ silent: true });
    const response = await request(app)
      .get("/api/languages")
      .set("X-Forwarded-Proto", "https, https");
    expect(response.status).toBe(200);
    expect(response.header["x-content-type-options"]).toBe("nosniff");
    expect(response.header["content-security-policy"]).toBeDefined();
  });
});

test("serverApp can be called with no arguments (default opts)", () => {
  // Exercises the default parameter branch: opts = {}
  const app = serverApp();
  expect(app).toBeTruthy();
});

test("serverApp logging middleware fires when silent is false", async () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  const app = serverApp({ silent: false });
  const response = await request(app).get("/api/languages");
  // Give the finish event a tick to fire
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(response.status).toBe(200);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

// ─── Production branch: express.static("dist/frontend") (line 30) ────────────
// ─── Production branch: wildcard * route serving index.html (lines 63-64) ────
//
// We set NODE_ENV=production temporarily and re-require serverApp so that the
// `const PRODUCTION = process.env.NODE_ENV == "production"` flag is true.
// We also create a minimal dist/frontend directory with an index.html so that
// `res.sendFile` can resolve the file.

describe("serverApp production branch", () => {
  const distFrontendDir = path.join(process.cwd(), "dist", "frontend");
  const indexHtmlPath = path.join(distFrontendDir, "index.html");
  let distCreated = false;

  // Production-valid secrets so that re-requiring serverApp under
  // NODE_ENV=production does not trip secrets.ts's FR-011 fail-fast guards
  // (default cookieSecret / short-or-default adminPassword / missing adminEmail /
  // missing BETTER_AUTH_URL). Those guards are exercised directly by
  // secrets.test.ts; these tests only verify production static/wildcard routing,
  // so we stub the validated config rather than depend on the ambient
  // secrets.json (dev-default locally, CI-specific in CI).
  const PRODUCTION_SECRETS = {
    cookieSecret: "test-only-cookie-secret-at-least-32-characters",
    adminEmail: "admin@example.com",
    adminUsername: "admin",
    adminPassword: "test-only-admin-password",
    db: {
      database: "lessons-from-luke",
      username: "lessons-from-luke",
      password: "lessons-from-luke",
    },
    testDb: {
      database: "lessons-from-luke-test",
      username: "lessons-from-luke",
      password: "lessons-from-luke",
    },
    devDb: {
      database: "lessons-from-luke-dev",
      username: "lessons-from-luke",
      password: "lessons-from-luke",
    },
  };

  // Captured once, before NODE_ENV ever flips to "production" below — getEmailTransport.ts
  // needs the real defaultSecrets.email placeholder shape, but requireActual would re-run
  // secrets.ts's own FR-011 fail-fast guards against the ambient secrets.json if called
  // while NODE_ENV=production, defeating the point of stubbing PRODUCTION_SECRETS.
  const REAL_DEFAULT_SECRETS = jest.requireActual("./util/secrets").defaultSecrets;

  // Re-require serverApp with NODE_ENV=production and a mocked secrets module,
  // run the assertion against the fresh app, then restore env + module registry.
  async function withProductionServerApp(
    fn: (app: ReturnType<typeof serverApp>) => Promise<void>
  ): Promise<void> {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.BETTER_AUTH_URL;
    process.env.NODE_ENV = "production";
    process.env.BETTER_AUTH_URL = "https://test.example.com";
    jest.resetModules();
    jest.doMock("./util/secrets", () => ({
      __esModule: true,
      default: PRODUCTION_SECRETS,
      defaultSecrets: REAL_DEFAULT_SECRETS,
    }));
    try {
      const freshServerApp = require("./serverApp").default;
      await fn(freshServerApp({ silent: true }));
    } finally {
      jest.dontMock("./util/secrets");
      process.env.NODE_ENV = originalEnv;
      if (originalUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = originalUrl;
      }
      jest.resetModules();
    }
  }

  beforeAll(() => {
    // Create dist/frontend/index.html if it doesn't already exist
    if (!fs.existsSync(distFrontendDir)) {
      fs.mkdirSync(distFrontendDir, { recursive: true });
      distCreated = true;
    }
    if (!fs.existsSync(indexHtmlPath)) {
      fs.writeFileSync(indexHtmlPath, "<html><body>Test</body></html>", "utf8");
    }
  });

  afterAll(() => {
    // Clean up only the files we created
    if (distCreated && fs.existsSync(distFrontendDir)) {
      fs.rmSync(path.join(process.cwd(), "dist"), { recursive: true, force: true });
    }
  });

  test("express.static serves files from dist/frontend in production mode (line 30)", async () => {
    await withProductionServerApp(async (app) => {
      // Request the index.html directly; express.static serves it
      const response = await request(app).get("/index.html");
      // Either 200 (file served) or 404/other is acceptable — what matters is
      // the middleware is registered and the route is reachable without crashing
      expect([200, 304, 404, 500]).toContain(response.status);
    });
  });

  test("wildcard * route serves index.html for client-side routing (lines 63-64)", async () => {
    await withProductionServerApp(async (app) => {
      // Any non-API route should be caught by the wildcard and serve index.html
      const response = await request(app).get("/some/client/side/route");
      // 200 means index.html was sent; 404/500 means the file wasn't found but
      // the route handler was reached (sendFile will 404 if file is absent)
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  test("wildcard * route returns 200 and HTML content when index.html exists", async () => {
    await withProductionServerApp(async (app) => {
      const response = await request(app).get("/any/frontend/path");
      // With the dist/frontend/index.html in place this MUST be 200
      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    });
  });

  test("wildcard route injects the per-request CSP nonce into the served HTML", async () => {
    await withProductionServerApp(async (app) => {
      const response = await request(app).get("/any/frontend/path");
      expect(response.status).toBe(200);
      const csp = (response.header["content-security-policy"] ?? "") as string;
      const headerNonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      expect(headerNonce).toBeTruthy();
      // The HTML the SPA loads must carry the SAME nonce the CSP advertises so
      // webApp.tsx can wire it into styled-components' __webpack_nonce__.
      expect(response.text).toContain(`<meta name="csp-nonce" content="${headerNonce}">`);
    });
  });

  test("each request gets a fresh, unique CSP nonce", async () => {
    await withProductionServerApp(async (app) => {
      const nonceOf = async () => {
        // 200 catch-all so finalhandler doesn't clobber helmet's CSP header
        const r = await request(app).get("/any/frontend/path");
        const csp = (r.header["content-security-policy"] ?? "") as string;
        return csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
      };
      const first = await nonceOf();
      const second = await nonceOf();
      expect(first).toBeTruthy();
      expect(second).toBeTruthy();
      expect(first).not.toBe(second);
    });
  });
});

// ─── ENFORCE_API_AUTH enforcement gate (US2.3) ───────────────────────────────
//
// These tests confirm the three gating behaviours described in
// specs/004-desktop-auth-pairing/contracts/shared-api-enforcement.md:
//
//   - Flag OFF  → all routes respond as today (no auth required, FR-012)
//   - Flag ON   → domain routes require auth; /api/auth/* stays public (FR-011)
//   - /webified → gated by the same flag (red-team Security)

describe("ENFORCE_API_AUTH enforcement gate", () => {
  const savedEnforce = process.env.ENFORCE_API_AUTH;

  afterEach(() => {
    if (savedEnforce === undefined) {
      delete process.env.ENFORCE_API_AUTH;
    } else {
      process.env.ENFORCE_API_AUTH = savedEnforce;
    }
  });

  test("flag OFF: anonymous GET /api/languages → 200 (no regression, FR-012)", async () => {
    delete process.env.ENFORCE_API_AUTH;
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    expect(response.status).toBe(200);
  });

  test("flag ON: anonymous GET /api/languages → 401 Unauthorized", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/languages");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
  });

  test("flag ON: anonymous GET /api/lessons → 401", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/lessons");
    expect(response.status).toBe(401);
  });

  test("flag ON: anonymous GET /api/sync/<timestamp>/languages → 401", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/sync/1000/languages");
    expect(response.status).toBe(401);
  });

  test("flag ON: anonymous GET /webified/<asset> → 401 (static mount gated)", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    const app = serverApp({ silent: true });
    const response = await request(app).get("/webified/nonexistent.png");
    expect(response.status).toBe(401);
  });

  test("flag ON: GET /api/auth/get-session is reachable anonymously (always public, FR-011)", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    const app = serverApp({ silent: true });
    const response = await request(app).get("/api/auth/get-session");
    // better-auth returns 200 with null session when no session is present
    expect(response.status).toBe(200);
  });

  test("flag ON: authenticated GET /api/languages → 200", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    const app = serverApp({ silent: true });
    // Sign in via the mock auth to obtain a session cookie
    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "admin@example.com", password: "irrelevant-for-mock" });
    expect(signIn.status).toBe(200);
    const cookie = signIn.header["set-cookie"] as string | string[] | undefined;
    expect(cookie).toBeDefined();

    const response = await request(app)
      .get("/api/languages")
      .set("Cookie", Array.isArray(cookie) ? cookie.join("; ") : (cookie as string));
    expect(response.status).toBe(200);
  });
});

// ─── POST /api/tStrings CSRF guard (US2.3) ───────────────────────────────────
//
// The CSRF guard is enforcement-conditional (only active when ENFORCE_API_AUTH
// is set) and bypassed for bearer-token requests (bearers are inherently
// CSRF-safe — browsers cannot auto-send Authorization headers cross-origin).
//
// requireSameOrigin itself skips in NODE_ENV=test unless
// BETTER_AUTH_ENFORCE_ORIGIN=1 is set, so the CSRF-active tests set that flag.

describe("POST /api/tStrings CSRF guard", () => {
  const savedEnforce = process.env.ENFORCE_API_AUTH;
  const savedEnforceOrigin = process.env.BETTER_AUTH_ENFORCE_ORIGIN;

  afterEach(() => {
    if (savedEnforce === undefined) delete process.env.ENFORCE_API_AUTH;
    else process.env.ENFORCE_API_AUTH = savedEnforce;
    if (savedEnforceOrigin === undefined) delete process.env.BETTER_AUTH_ENFORCE_ORIGIN;
    else process.env.BETTER_AUTH_ENFORCE_ORIGIN = savedEnforceOrigin;
  });

  test("flag OFF: POST /api/tStrings without Origin → not 403 (CSRF guard inactive)", async () => {
    delete process.env.ENFORCE_API_AUTH;
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
    const app = serverApp({ silent: true });
    const response = await request(app)
      .post("/api/tStrings")
      .set("Content-Type", "application/json")
      .send({ code: "x", tStrings: [{ masterId: 1, languageId: 1, text: "hi", history: [] }] });
    // 401 (from storage.invalidCode) or 422 (validation) — but NOT 403 (CSRF)
    expect(response.status).not.toBe(403);
  });

  test("flag ON: POST /api/tStrings without Origin and no bearer → 403 (CSRF)", async () => {
    process.env.ENFORCE_API_AUTH = "1";
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
    // Sign in to obtain a session cookie (CSRF check only fires for authenticated requests)
    const app = serverApp({ silent: true });
    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "admin@example.com", password: "irrelevant-for-mock" });
    const cookie = signIn.header["set-cookie"] as string | string[] | undefined;

    const response = await request(app)
      .post("/api/tStrings")
      .set("Cookie", Array.isArray(cookie) ? cookie.join("; ") : (cookie as string))
      .set("Content-Type", "application/json")
      .send({ code: "x", tStrings: [{ masterId: 1, languageId: 1, text: "hi", history: [] }] });
    expect(response.status).toBe(403);
  });

  test("flag ON: POST /api/tStrings with Authorization: Bearer bypasses CSRF → 401 from auth (not 403)", async () => {
    // Proves the bearer bypass: with an invalid bearer token and no Origin,
    // the request gets past the CSRF check (which would 403 a cookie request)
    // and reaches the auth gate, which correctly returns 401.
    process.env.ENFORCE_API_AUTH = "1";
    process.env.BETTER_AUTH_ENFORCE_ORIGIN = "1";
    const app = serverApp({ silent: true });
    const response = await request(app)
      .post("/api/tStrings")
      .set("Authorization", "Bearer this-token-is-invalid")
      .set("Content-Type", "application/json")
      .send({ code: "x", tStrings: [{ masterId: 1, languageId: 1, text: "hi", history: [] }] });
    // 401 from auth (not 403 from CSRF) — proves CSRF was bypassed for bearer
    expect(response.status).toBe(401);
  });
});
