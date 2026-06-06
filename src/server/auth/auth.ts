import { betterAuth } from "better-auth";
import { Pool } from "pg";
import secrets from "../util/secrets";

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
export function getAuth(): ReturnType<typeof betterAuth<any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
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
    advanced: {
      // Explicitly enforce Secure cookies in production regardless of
      // baseURL scheme detection, so a misconfigured proxy can't silently
      // downgrade cookie security.
      useSecureCookies: process.env.NODE_ENV === "production",
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      // Explicitly cap password length — not relying on unverified library default (red-team Pass 2)
      maxPasswordLength: 128,
    },
    rateLimit: {
      enabled: true,
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
