/**
 * rateLimitCounter.test.ts — unit tests for the shared TTL-prune +
 * read-then-write throttle-counter helper.
 *
 * Remediation: dedup of the identical TTL-prune + read-then-write
 * throttle-counter pattern independently hand-rolled in auth.ts's
 * sendResetPassword reset-req throttle and invitationController.ts's
 * isResendThrottled (task lessons-from-luke-5qjl.14). Single source of
 * truth, same convention as escapeHtml (lessons-from-luke-5qjl.12),
 * getWebAppBaseUrl/getInvitationBaseUrl (lessons-from-luke-5qjl.9), and
 * getEmailTransport's placeholder literal (lessons-from-luke-5qjl.7).
 *
 * Exercises the real `rateLimit` table (same table better-auth itself uses)
 * via the test-DB pool — jestSetupAfterEnv.ts clears "rateLimit" after every
 * test, so no manual cleanup is needed here.
 */

import { Pool } from "pg";
import { checkAndIncrementThrottle } from "./rateLimitCounter";
import secrets from "./secrets";

const { username: dbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const testPool = new Pool({ ...restTestDb, user: dbUser, max: 2 });

afterAll(async () => {
  await testPool.end();
});

async function insertRow(key: string, count: number, lastRequest: number): Promise<void> {
  await testPool.query(
    `INSERT INTO "rateLimit" (id, key, count, "lastRequest") VALUES (gen_random_uuid()::text, $1, $2, $3)`,
    [key, count, lastRequest]
  );
}

async function getRow(key: string): Promise<{ count: number; lastRequest: string } | undefined> {
  const result = await testPool.query<{ count: number; lastRequest: string }>(
    `SELECT count, "lastRequest" FROM "rateLimit" WHERE key = $1`,
    [key]
  );
  return result.rows[0];
}

describe("checkAndIncrementThrottle", () => {
  it("first call for a fresh key inserts count=1 and reports not throttled", async () => {
    const key = "test-prefix:fresh-key";

    const throttled = await checkAndIncrementThrottle(testPool, "test-prefix:", key, 60_000, 3);

    expect(throttled).toBe(false);
    const row = await getRow(key);
    expect(row?.count).toBe(1);
  });

  it("increments the existing counter within the window and stays under the limit", async () => {
    const key = "test-prefix:within-window";
    const nowMs = Date.now();
    await insertRow(key, 1, nowMs);

    const throttled = await checkAndIncrementThrottle(testPool, "test-prefix:", key, 60_000, 3);

    expect(throttled).toBe(false);
    const row = await getRow(key);
    expect(row?.count).toBe(2);
  });

  it("reports throttled once the count exceeds max within the window", async () => {
    const key = "test-prefix:over-limit";
    const nowMs = Date.now();
    await insertRow(key, 3, nowMs);

    const throttled = await checkAndIncrementThrottle(testPool, "test-prefix:", key, 60_000, 3);

    expect(throttled).toBe(true);
    const row = await getRow(key);
    expect(row?.count).toBe(4);
  });

  it("resets the counter to 1 when the existing row's window has expired", async () => {
    const key = "test-prefix:expired-window";
    const staleLastRequest = Date.now() - 120_000; // 120s ago, window is 60s
    await insertRow(key, 5, staleLastRequest);

    const throttled = await checkAndIncrementThrottle(testPool, "test-prefix:", key, 60_000, 3);

    expect(throttled).toBe(false);
    const row = await getRow(key);
    expect(row?.count).toBe(1);
  });

  it("TTL-prunes stale rows scoped to keyPrefix only — rows outside the prefix survive", async () => {
    const staleKey = "test-prefix:stale-row";
    const otherPrefixKey = "other-prefix:should-survive";
    const staleLastRequest = Date.now() - 120_000; // outside the 60s window
    await insertRow(staleKey, 1, staleLastRequest);
    await insertRow(otherPrefixKey, 1, staleLastRequest);

    await checkAndIncrementThrottle(
      testPool,
      "test-prefix:",
      "test-prefix:unrelated-active-key",
      60_000,
      3
    );

    expect(await getRow(staleKey)).toBeUndefined();
    expect(await getRow(otherPrefixKey)).not.toBeUndefined();
  });
});
