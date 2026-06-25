/**
 * invitationRateLimit.ts — Per-IP rate-limit middleware for invitation routes
 *
 * Spec: specs/002-invitation-system/spec.md §Security Considerations (Pass 1/2/3/12)
 * Plan: plan.md Pass 1/2/3/12
 *
 * Stores per-IP request counts in the invitationRateLimit table:
 *   key text PK, count int, lastRequest bigint (milliseconds since epoch)
 *
 * Atomic UPSERT with window-based reset:
 *   If lastRequest < windowStart → reset count to 1 (new window)
 *   Otherwise → increment count
 *   Returns count; if count > RATE_LIMIT_MAX → 429
 *
 * Enforced when: NODE_ENV !== 'test' || BETTER_AUTH_ENFORCE_RATE_LIMIT === '1'
 *
 * KEY TRUST MODEL
 * ---------------
 * The primary rate-limit key is 'invitation:' + clientIp(req). Under the
 * deployed topology — Cloudflare in front of Phusion Passenger — there are TWO
 * proxy hops and BOTH APPEND to X-Forwarded-For. So under app.set('trust
 * proxy', 1) (serverApp.ts) Express's req.ip resolves to a Cloudflare EDGE IP
 * (172.64.0.0/13), NOT the real client: every distinct client arriving via the
 * same edge would share one bucket and throttle each other.
 *
 * clientIp() therefore keys on Cloudflare's CF-Connecting-IP header, which
 * Cloudflare sets to the real connecting IP and the client cannot override,
 * falling back to req.ip only when Cloudflare is absent (dev / supertest, where
 * the header is not present — then req.ip, the trust-proxy-derived value, is the
 * correct client IP). This mirrors auth.ts's better-auth ipAddressHeaders
 * ordering (["cf-connecting-ip", "x-forwarded-for"]) so the two limiters never
 * drift, and is independent of `trust proxy`. See clientIp() below and the
 * trust-proxy comment in serverApp.ts.
 *
 * Residual risk: a client connecting DIRECTLY to the origin (bypassing
 * Cloudflare) could set CF-Connecting-IP itself. Mitigate at the infra layer by
 * firewalling ingress to Cloudflare's published IP ranges — out of scope for
 * this middleware.
 *
 * SECONDARY (TOKEN-SCOPED) KEY — graceful degradation
 * ----------------------------------------------------
 * For the GET /api/auth/invitation/:token lookup endpoint the caller can
 * also pass a secondary key (e.g. the SHA-256 hex of the token). When present,
 * BOTH keys are checked and the stricter limit applies. This means even if the
 * client IP were unreliable, each unique token still has its own rate-limit
 * bucket and cannot be brute-forced at unbounded rate.
 */

import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const RATE_LIMIT_MAX = 10;

/**
 * Authoritative client IP behind Cloudflare. CF-Connecting-IP is set by
 * Cloudflare to the real connecting IP and cannot be spoofed by the client;
 * it is absent when Cloudflare is off (then req.ip — the trust-proxy-derived
 * value — is correct). Mirrors auth.ts's ipAddressHeaders ordering; uses
 * req.ip (not raw x-forwarded-for) as the fallback because this in-app limiter
 * has the trust-proxy-aware value available. Independent of `trust proxy`.
 */
export function clientIp(req: Request): string {
  const cf = req.headers["cf-connecting-ip"];
  const value = Array.isArray(cf) ? cf[0] : cf;
  const trimmed = value?.trim();
  return trimmed ? trimmed : (req.ip ?? "unknown");
}

/**
 * Creates an Express middleware that enforces a per-IP rate limit on invitation
 * routes using the invitationRateLimit table.
 *
 * Skipped when NODE_ENV=test AND BETTER_AUTH_ENFORCE_RATE_LIMIT !== '1',
 * mirroring the existing BETTER_AUTH_ENFORCE_RATE_LIMIT flag (plan.md Pass 12).
 *
 * @param pool            The auth-owned pg.Pool passed from the controller.
 * @param secondaryKeyFn  Optional function to derive a secondary rate-limit key
 *                        from the request (e.g. SHA-256 of the token path param).
 *                        When provided, BOTH the IP-key and the secondary key are
 *                        checked; the first to exceed the limit wins with 429.
 */
export function invitationRateLimit(pool: Pool, secondaryKeyFn?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip in test mode unless enforcement flag is set
    if (process.env.NODE_ENV === "test" && process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT !== "1") {
      next();
      return;
    }

    const nowMs = Date.now();
    const windowStart = nowMs - RATE_LIMIT_WINDOW_MS;
    const ipKey = `invitation:${clientIp(req)}`;
    const secondaryKey = secondaryKeyFn ? secondaryKeyFn(req) : undefined;

    const client = await pool.connect();
    try {
      // Prune stale entries from previous windows (same round-trip)
      await client.query(`DELETE FROM "invitationRateLimit" WHERE "lastRequest" < $1`, [
        windowStart,
      ]);

      // Atomic UPSERT helper: returns the post-increment count for a key
      const upsertCount = async (k: string): Promise<number> => {
        const r = await client.query<{ count: number }>(
          `INSERT INTO "invitationRateLimit" (key, count, "lastRequest")
           VALUES ($1, 1, $2)
           ON CONFLICT (key) DO UPDATE SET
             count = CASE
               WHEN "invitationRateLimit"."lastRequest" < $3 THEN 1
               ELSE "invitationRateLimit".count + 1
             END,
             "lastRequest" = $2
           RETURNING count`,
          [k, nowMs, windowStart]
        );
        return r.rows[0]?.count ?? 1;
      };

      // Check primary (IP-based) key
      const ipCount = await upsertCount(ipKey);
      if (ipCount > RATE_LIMIT_MAX) {
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return;
      }

      // Check secondary (token-scoped) key when present — graceful degradation
      // if the client IP is unreliable (see header comment).
      if (secondaryKey !== undefined) {
        const secondaryCount = await upsertCount(secondaryKey);
        if (secondaryCount > RATE_LIMIT_MAX) {
          res.status(429).json({ error: "Too many requests. Please try again later." });
          return;
        }
      }

      next();
    } finally {
      client.release();
    }
  };
}
