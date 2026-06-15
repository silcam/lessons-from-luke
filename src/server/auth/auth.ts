import { betterAuth } from "better-auth";
import { Pool } from "pg";
import secrets from "../util/secrets";
import * as passwordHasher from "./passwordHasher";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authInstance: ReturnType<typeof betterAuth<any>> | null = null;

/**
 * Returns the singleton better-auth instance, creating it on first call.
 *
 * The pg.Pool is isolated from the domain porsager driver. Pool size is
 * capped at 5 so the combined ceiling stays well under postgres
 * max_connections=100 (porsager defaults to os.cpus() ≤4 on this VPS).
 *
 * FR-001, FR-002, FR-006, FR-010, FR-012
 */
export function getAuth(): ReturnType<typeof betterAuth<any>> {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (authInstance) {
    return authInstance;
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
  const pool = new Pool({ ...restDbConfig, user: username, max: 5 });

  authInstance = betterAuth({
    database: pool,
    secret: secrets.cookieSecret,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8081",
    // Pin trusted origins to the explicit public URL so better-auth's
    // origin/CSRF checks are never silently widened by a misconfigured proxy.
    // In production the SPA is served from the same origin as BETTER_AUTH_URL,
    // so that single origin is all we trust. In local dev the webpack dev server
    // (yarn dev-web :8080, yarn dev-desktop :8082) is a DIFFERENT origin from the
    // API (:8081) and proxies /api to it, so the browser's Origin is :8080/:8082;
    // trust those (plus the API origin) so cross-origin dev login isn't rejected
    // with "Invalid origin". NODE_ENV=test skips origin checks entirely.
    trustedOrigins: process.env.BETTER_AUTH_URL
      ? [process.env.BETTER_AUTH_URL]
      : process.env.NODE_ENV === "development"
        ? ["http://localhost:8080", "http://localhost:8081", "http://localhost:8082"]
        : [],
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
  });

  return authInstance;
}

/**
 * Nulls out the singleton so the next getAuth() call creates a fresh instance
 * with a new pool. Used for test isolation only.
 */
export function resetAuth(): void {
  authInstance = null;
}
