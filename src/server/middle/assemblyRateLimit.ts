/**
 * assemblyRateLimit.ts — Per-user rate-limit middleware for the assembly
 * start route.
 *
 * Remediation: lessons-from-luke-ipuf.7 (sp:security-review CRITICAL —
 * POST .../assembly was the only state-changing route in the app not gated
 * by an authenticated-session check or a rate limit, and each accepted POST
 * can spend up to ~7 minutes of soffice CPU on a 2 vCPU / 2 GB host). This
 * middleware is the rate-limit half of that fix; `requireUser` (mounted
 * ahead of it on the route) is the authentication half.
 *
 * Modeled directly on `invitationRateLimit.ts`: same TTL-prune + UPSERT
 * window approach, but reuses the shared `checkAndIncrementThrottle` helper
 * (`util/rateLimitCounter.ts`) — the same helper `auth.ts`'s
 * sendResetPassword throttle and `invitationController.ts`'s resend
 * throttle already use — against the same better-auth-owned `rateLimit`
 * table, keyed by the authenticated user's id (not IP): the route already
 * requires a session by the time this middleware runs, and a signed-in
 * attacker rotating IPs should not get a fresh bucket per IP.
 *
 * Skipped when NODE_ENV=test AND BETTER_AUTH_ENFORCE_RATE_LIMIT !== '1',
 * mirroring the existing flag `invitationRateLimit.ts` and `auth.ts` already
 * use, so the normal Jest suite doesn't need a live Postgres pool.
 */

import { Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { checkAndIncrementThrottle } from "../util/rateLimitCounter";

/** 5-minute sliding window — generous for a legitimate translator/admin re-triggering a merge. */
export const ASSEMBLY_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

/**
 * Max assembly-start requests per user per window. Each accepted job can
 * occupy the concurrency-1 soffice pipeline for minutes, so this is
 * intentionally tight relative to `invitationRateLimit.ts`'s 10/60s.
 */
export const ASSEMBLY_RATE_LIMIT_MAX = 5;

/**
 * Creates an Express middleware enforcing a per-user rate limit on the
 * assembly start route. Must run AFTER `requireUser` — reads `req.user.id`.
 *
 * @param pool - the shared auth-owned pg.Pool (`getAuthPool()`).
 */
export default function assemblyRateLimit(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip in test mode unless enforcement flag is set (mirrors
    // invitationRateLimit.ts / auth.ts's BETTER_AUTH_ENFORCE_RATE_LIMIT gate).
    if (process.env.NODE_ENV === "test" && process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT !== "1") {
      next();
      return;
    }

    // requireUser has already rejected unauthenticated requests by the time
    // this middleware runs, so req.user is always populated here.
    const userId = req.user?.id ?? "unknown";
    const key = `assembly:${userId}`;

    const throttled = await checkAndIncrementThrottle(
      pool,
      "assembly:",
      key,
      ASSEMBLY_RATE_LIMIT_WINDOW_MS,
      ASSEMBLY_RATE_LIMIT_MAX
    );

    if (throttled) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }

    next();
  };
}
