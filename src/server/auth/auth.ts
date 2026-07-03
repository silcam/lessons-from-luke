import { betterAuth, APIError } from "better-auth";
import { Pool } from "pg";
import secrets from "../util/secrets";
import * as passwordHasher from "./passwordHasher";
import { DEFAULT_BASE_URL, getTrustedOrigins } from "./trustedOrigins";
import { CF_CONNECTING_IP } from "../util/clientIp";
import { isAccountDeactivated } from "./userStore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authInstance: ReturnType<typeof betterAuth<any>> | null = null;
let authPoolInstance: Pool | null = null;

/**
 * Returns the singleton pg.Pool used by better-auth and invitation routes.
 *
 * The pool is isolated from the domain porsager driver. Pool size is capped at
 * 5 so the combined ceiling stays well under postgres max_connections=100.
 * Sharing a single Pool between better-auth and invitation routes means only
 * one pool exists for auth-database operations at runtime (FR-001 architecture
 * requirement).
 */
export function getAuthPool(): Pool {
  if (authPoolInstance) {
    return authPoolInstance;
  }

  const dbConfig =
    process.env.NODE_ENV === "test"
      ? secrets.testDb
      : process.env.NODE_ENV === "development"
        ? secrets.devDb
        : secrets.db;

  // porsager/postgres uses "username" but pg/Pool (used by better-auth) uses "user".
  // Remap so the pool connects with the correct credentials.
  const { username, ...restDbConfig } = dbConfig as typeof dbConfig & { username?: string };
  authPoolInstance = new Pool({ ...restDbConfig, user: username, max: 5 });
  return authPoolInstance;
}

/**
 * Returns the singleton better-auth instance, creating it on first call.
 *
 * Uses getAuthPool() so better-auth and invitation routes share a single
 * pg.Pool instance for all auth-database operations.
 *
 * FR-001, FR-002, FR-006, FR-010, FR-012
 */
export function getAuth(): ReturnType<typeof betterAuth<any>> {
  if (authInstance) {
    return authInstance;
  }

  const pool = getAuthPool();

  authInstance = betterAuth({
    database: pool,
    secret: secrets.cookieSecret,
    baseURL: process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL,
    // Pin trusted origins to the explicit public URL so better-auth's
    // origin/CSRF checks are never silently widened by a misconfigured proxy.
    // In production the SPA is served from the same origin as BETTER_AUTH_URL,
    // so that single origin is all we trust. In local dev the webpack dev server
    // (yarn dev-web :8080, yarn dev-desktop :8082) is a DIFFERENT origin from the
    // API (:8081) and proxies /api to it, so the browser's Origin is :8080/:8082;
    // trust those (plus the API origin) so cross-origin dev login isn't rejected
    // with "Invalid origin". NODE_ENV=test skips origin checks entirely.
    // The allow-list is sourced from trustedOrigins.ts so it stays in sync with
    // the CSRF middleware in invitationController.ts (architecture-review 9c7.13).
    trustedOrigins: getTrustedOrigins() ?? [],
    advanced: {
      // Explicitly enforce Secure cookies in production regardless of
      // baseURL scheme detection, so a misconfigured proxy can't silently
      // downgrade cookie security.
      useSecureCookies: process.env.NODE_ENV === "production",
      // better-auth auto-skips origin/CSRF enforcement under NODE_ENV=test. The
      // integration server (which must run NODE_ENV=test for PGTestStorage) sets
      // BETTER_AUTH_ENFORCE_ORIGIN=1 so the integration suite can exercise the
      // production trustedOrigins enforcement that test mode would otherwise skip.
      // Left undefined elsewhere → better-auth's env default (enforced in
      // production, skipped in test/dev so cross-origin dev login still works).
      disableOriginCheck: process.env.BETTER_AUTH_ENFORCE_ORIGIN === "1" ? false : undefined,
      // Key rate-limiting on the real, non-spoofable client IP. better-auth
      // derives the client IP itself (it ignores Express req.ip); the first
      // header yielding a valid IP wins. CF_CONNECTING_IP is the shared constant
      // (util/clientIp.ts) so this never drifts from the in-app clientIp()
      // helper. The "x-forwarded-for" entry is better-auth's lib-level fallback
      // for when cf-connecting-ip is absent (supertest / Cloudflare OFF) — the
      // intentional divergence from clientIp(), which falls back to the
      // trust-proxy-aware req.ip (unavailable to better-auth) instead.
      // Independent of Express's `trust proxy`.
      ipAddress: { ipAddressHeaders: [CF_CONNECTING_IP, "x-forwarded-for"] },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      // Explicitly cap password length — not relying on unverified library default (red-team Pass 2)
      maxPasswordLength: 128,
      // Wire Argon2id hasher — overrides better-auth's default scrypt so runtime
      // verification matches the seeded credential format (FR-001, spec §SC-003).
      // better-auth passes { hash, password } to verify; passwordHasher.verify takes
      // (storedHash, password), so we destructure to map the signatures.
      password: {
        hash: (password: string) => passwordHasher.hash(password),
        verify: ({ hash, password }: { hash: string; password: string }) =>
          passwordHasher.verify(hash, password),
      },
    },
    rateLimit: {
      // On in production and dev (a sign-in brute-force safeguard, red-team Pass 1).
      // Off under NODE_ENV=test so the Cypress e2e suite's many cy.login() calls
      // aren't throttled (429) — EXCEPT the integration server, which sets
      // BETTER_AUTH_ENFORCE_RATE_LIMIT=1 so its ">10 attempts → 429" test still runs.
      enabled:
        process.env.NODE_ENV !== "test" || process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT === "1",
      // DB-backed so limits are shared across workers under Passenger (red-team Pass 1)
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
      },
    },
    user: {
      additionalFields: {
        admin: {
          type: "boolean",
          defaultValue: false,
          // input: false prevents admin from being set via any public API;
          // only the seed/raw SQL sets admin: true
          input: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Fail-closed deactivation enforcement at sign-in (US2/FR-005,
          // data-model.md §Enforcement points). Deliberately NOT wrapped in
          // try/catch-and-continue: if the deactivatedAt lookup itself throws
          // (pool/DB error), that error propagates and aborts session
          // creation — sign-in fails rather than silently succeeding.
          before: async (session: { userId: string }) => {
            if (await isAccountDeactivated(pool, session.userId)) {
              throw new APIError("UNAUTHORIZED", {
                message: "This account has been deactivated.",
              });
            }
          },
        },
      },
    },
  });

  return authInstance;
}

/**
 * Nulls out the singletons so the next getAuth()/getAuthPool() call creates a
 * fresh instance with a new pool. Used for test isolation only.
 */
export function resetAuth(): void {
  authInstance = null;
  authPoolInstance = null;
}
