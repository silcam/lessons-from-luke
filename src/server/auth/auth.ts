import { createHash, createHmac } from "crypto";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import secrets from "../util/secrets";
import * as passwordHasher from "./passwordHasher";
import { DEFAULT_BASE_URL, getTrustedOrigins } from "./trustedOrigins";
import { CF_CONNECTING_IP } from "../util/clientIp";
import { getEmailTransport } from "../email/getEmailTransport";
import { buildPasswordResetEmail } from "../email/messages/passwordResetEmail";
import { buildPasswordChangedEmail } from "../email/messages/passwordChangedEmail";

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
      // Revoke all active sessions when the password is reset (FR-009/SC-005).
      revokeSessionsOnPasswordReset: true,
      // Explicit TTL — default is 3600 s; stated here for reviewability (spec §D4).
      resetPasswordTokenExpiresIn: 3600,
      // -----------------------------------------------------------------------
      // sendResetPassword — fire-and-forget email dispatch (Pass 2/6)
      //
      // The synchronous body dispatches the entire background chain as a void
      // promise and returns immediately (account-existence-independent timing,
      // Pass 6). All DB work (throttle check, supersession, cleanup) runs only
      // inside the background task, never on the awaited request path.
      //
      // Background chain (ordered):
      //   1. Compute HMAC per-address throttle key (Pass 8/9)
      //   2. TTL-prune stale reset-req: counters (Pass 10)
      //   3. Upsert throttle counter and check limit (Pass 3/5)
      //   4a. Over-limit: delete just-written verification row; skip supersession (Pass 5)
      //   4b. Under-limit: supersede prior verification rows; send reset email (Pass 2)
      //
      // The better-auth `url` arg is intentionally ignored — the email builder
      // constructs the reset link from getWebAppBaseUrl() to prevent open-redirect
      // / phishing via a crafted request URL (Pass 1).
      // -----------------------------------------------------------------------
      sendResetPassword: async ({
        user,
        url: _url,
        token,
      }: {
        user: { id: string; email: string; name: string };
        url: string;
        token: string;
      }): Promise<void> => {
        // Fire-and-forget: all background work runs without blocking the caller.
        void (async () => {
          try {
            const pool = getAuthPool();
            const nowMs = Date.now();
            // 60-second window: mirrors the per-IP customRules for /request-password-reset.
            const windowMs = 60 * 1_000;
            // 3 sends per window: matches the per-IP customRules max (Pass 3).
            const maxPerWindow = 3;
            const windowStart = nowMs - windowMs;

            // 1. Compute HMAC per-address throttle key (Pass 8/9).
            //    Key = reset-req:<HMAC-SHA256(HMAC(cookieSecret,"reset-req-throttle"), email.toLowerCase())>
            //    Derives from cookieSecret (≥32 chars, always present) via a
            //    domain-separated sub-key. No cleartext email is persisted.
            const subKey = createHmac("sha256", secrets.cookieSecret)
              .update("reset-req-throttle")
              .digest();
            const emailHash = createHmac("sha256", subKey)
              .update(user.email.toLowerCase())
              .digest("hex");
            const throttleKey = `reset-req:${emailHash}`;

            // 2. TTL-prune stale reset-req: counters only (Pass 10).
            //    Scoped to 'reset-req:%' so sign-in/email rows are never touched.
            await pool.query(
              `DELETE FROM "rateLimit" WHERE "key" LIKE 'reset-req:%' AND "lastRequest" < $1`,
              [windowStart],
            );

            // 3. Read-then-write throttle counter (rateLimit.key has no unique
            //    constraint, so ON CONFLICT (key) is unavailable; we mirror
            //    better-auth's own GET+SET pattern from createDatabaseStorageWrapper).
            //    Semantics: reset to 1 when the window has expired, otherwise
            //    increment — matching the count/window logic in the rate-limiter.
            const existingResult = await pool.query<{
              id: string;
              count: number;
              lastRequest: bigint | number | string;
            }>(`SELECT id, count, "lastRequest" FROM "rateLimit" WHERE key = $1 LIMIT 1`, [
              throttleKey,
            ]);

            let count: number;
            const existing = existingResult.rows[0];

            if (!existing) {
              // No prior entry: insert with count = 1 (start of new window).
              await pool.query(
                `INSERT INTO "rateLimit" (id, key, count, "lastRequest")
                 VALUES (gen_random_uuid()::text, $1, 1, $2)`,
                [throttleKey, nowMs],
              );
              count = 1;
            } else {
              const lastRequest = Number(existing.lastRequest);
              if (nowMs - lastRequest > windowMs) {
                // Window expired: reset count to 1.
                await pool.query(
                  `UPDATE "rateLimit" SET count = 1, "lastRequest" = $1 WHERE id = $2`,
                  [nowMs, existing.id],
                );
                count = 1;
              } else {
                // Within window: increment count.
                await pool.query(
                  `UPDATE "rateLimit" SET count = count + 1, "lastRequest" = $1 WHERE id = $2`,
                  [nowMs, existing.id],
                );
                count = existing.count + 1;
              }
            }
            const throttled = count > maxPerWindow;

            // Compute the hashed identifier for the just-written row once — used in
            // both the throttled (4a, delete just-written) and non-throttled (4b,
            // exclude just-written from supersession delete) paths.
            //
            // MUST match better-auth's storeIdentifier: "hashed" encoding exactly
            // (verification-token-storage.mjs: base64url(SHA-256(identifier)) without
            // padding). Node's Buffer.toString("base64url") produces the same encoding:
            // no `+`/`/` chars, no `=` padding — identical to @better-auth/utils/base64
            // base64Url.encode(new Uint8Array(hash), { padding: false }).
            const justWrittenIdentifier = createHash("sha256")
              .update(`reset-password:${token}`)
              .digest()
              .toString("base64url");

            if (throttled) {
              // 4a. Over-limit: delete the just-written verification row to prevent
              //     it lingering to expiry (Pass 5 — coupled supersession). Do NOT
              //     delete prior rows (no supersession on a suppressed request).
              await pool.query(`DELETE FROM "verification" WHERE identifier = $1`, [
                justWrittenIdentifier,
              ]);
              return;
            }

            // 4b. Under-limit: supersede all prior verification rows for this user
            //     (Pass 2). DELETE all rows WHERE value = userId EXCEPT the one just
            //     written (identifier = justWrittenIdentifier), so the just-sent link
            //     is the only surviving one. The just-written row must be excluded so
            //     the token in the outgoing email remains valid when better-auth
            //     validates it at /reset-password.
            await pool.query(
              `DELETE FROM "verification" WHERE value = $1 AND identifier != $2`,
              [user.id, justWrittenIdentifier],
            );

            // Build and send the password reset email.
            // Errors are logged (to + subject + error only — no text/html, Pass 1)
            // and swallowed so they don't propagate to the caller.
            const msg = buildPasswordResetEmail(user.email, token, "en");
            try {
              await getEmailTransport().send(msg);
            } catch (sendErr) {
              console.error("passwordResetEmail send failed", {
                to: msg.to,
                subject: msg.subject,
                error: sendErr,
              });
            }
          } catch (bgErr) {
            // Swallow: background errors must never propagate to the caller.
            console.error("sendResetPassword background chain error", bgErr);
          }
        })();
      },
      // -----------------------------------------------------------------------
      // onPasswordReset — fire-and-forget confirmation email (Pass 4)
      //
      // Dispatches a "your password was changed" notice to the account owner
      // as a best-effort security signal. The send is backgrounded and any
      // throw is self-caught so it never delays or errors the /reset-password
      // response (Pass 4).
      // -----------------------------------------------------------------------
      onPasswordReset: async ({
        user,
      }: {
        user: { id: string; email: string; name: string };
      }): Promise<void> => {
        // Fire-and-forget: dispatch confirmation email without blocking.
        void (async () => {
          try {
            const msg = buildPasswordChangedEmail(user.email, "en");
            await getEmailTransport().send(msg);
          } catch {
            // Self-catch: never propagate (Pass 4).
          }
        })();
      },
    },
    // Verification tokens stored as SHA-256 hashes (Pass 8 at-rest token confidentiality).
    // A DB leak yields SHA-256("reset-password:<token>"), not the raw token, so the
    // attacker still cannot forge a reset without bruteforcing the hash.
    verification: {
      storeIdentifier: "hashed" as const,
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
        // Per-IP rate limits for password reset endpoints (research §D8).
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
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
 * Nulls out the singletons so the next getAuth()/getAuthPool() call creates a
 * fresh instance with a new pool. Used for test isolation only.
 */
export function resetAuth(): void {
  authInstance = null;
  authPoolInstance = null;
}
