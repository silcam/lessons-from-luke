/**
 * rateLimitCounter.ts — shared TTL-prune + read-then-write throttle-counter
 * helper for the better-auth-owned `rateLimit` table.
 *
 * Remediation: dedup of the identical TTL-prune + read-then-write
 * throttle-counter pattern independently hand-rolled in auth.ts's
 * sendResetPassword reset-req throttle and invitationController.ts's
 * isResendThrottled (task lessons-from-luke-5qjl.14). Single source of
 * truth, same convention as escapeHtml (lessons-from-luke-5qjl.12),
 * getWebAppBaseUrl/getInvitationBaseUrl (lessons-from-luke-5qjl.9), and
 * getEmailTransport's placeholder literal (lessons-from-luke-5qjl.7).
 *
 * `rateLimit.key` carries no unique constraint, so callers cannot rely on an
 * atomic `ON CONFLICT` UPSERT — this mirrors better-auth's own GET+SET
 * pattern instead (createDatabaseStorageWrapper).
 */

import { Pool } from "pg";

/**
 * TTL-prunes stale counter rows scoped to `keyPrefix`, then performs a
 * read-then-write count-or-reset against the exact `key`, and reports
 * whether the resulting count exceeds `max`.
 *
 * @param pool - the shared auth-owned pg.Pool.
 * @param keyPrefix - namespace prefix (e.g. "reset-req:" or "resend:") used
 *   ONLY to scope the TTL-prune `LIKE` clause, so unrelated counters (e.g.
 *   better-auth's own `<ip>:/sign-in/email` rows) are never touched.
 * @param key - the exact counter key (must start with `keyPrefix`).
 * @param windowMs - sliding window length in milliseconds.
 * @param max - the maximum allowed count within the window before the
 *   caller should treat the request as throttled.
 * @returns true when this call pushed the count over `max`.
 */
export async function checkAndIncrementThrottle(
  pool: Pool,
  keyPrefix: string,
  key: string,
  windowMs: number,
  max: number
): Promise<boolean> {
  const nowMs = Date.now();
  const windowStart = nowMs - windowMs;

  // TTL-prune stale counters scoped to keyPrefix only.
  await pool.query(`DELETE FROM "rateLimit" WHERE "key" LIKE $1 AND "lastRequest" < $2`, [
    `${keyPrefix}%`,
    windowStart,
  ]);

  // Read-then-write throttle counter (rateLimit.key has no unique
  // constraint, so ON CONFLICT (key) is unavailable).
  const existingResult = await pool.query<{
    id: string;
    count: number;
    lastRequest: bigint | number | string;
  }>(`SELECT id, count, "lastRequest" FROM "rateLimit" WHERE key = $1 LIMIT 1`, [key]);

  const existing = existingResult.rows[0];
  let count: number;

  if (!existing) {
    // No prior entry: insert with count = 1 (start of new window).
    await pool.query(
      `INSERT INTO "rateLimit" (id, key, count, "lastRequest")
       VALUES (gen_random_uuid()::text, $1, 1, $2)`,
      [key, nowMs]
    );
    count = 1;
  } else if (nowMs - Number(existing.lastRequest) > windowMs) {
    // Window expired: reset count to 1.
    await pool.query(`UPDATE "rateLimit" SET count = 1, "lastRequest" = $1 WHERE id = $2`, [
      nowMs,
      existing.id,
    ]);
    count = 1;
  } else {
    // Within window: increment count.
    await pool.query(`UPDATE "rateLimit" SET count = count + 1, "lastRequest" = $1 WHERE id = $2`, [
      nowMs,
      existing.id,
    ]);
    count = existing.count + 1;
  }

  return count > max;
}
