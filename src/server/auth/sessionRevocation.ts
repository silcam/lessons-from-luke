/**
 * sessionRevocation.ts — Admin revoke-by-user: atomically deletes all
 * deviceCode and session rows for a given user, preventing the race where an
 * approved-but-not-yet-redeemed deviceCode could mint a new session after the
 * session rows have been deleted.
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Data model: data-model.md §Entity 1 (row cleanup on revoke), §Entity 2
 * Research: R8 — session == credential, admin revoke = DELETE FROM "session"
 */

import { Pool } from "pg";

/**
 * Atomically revokes all device codes and sessions for a user.
 *
 * DELETE order is load-bearing: deviceCode rows are deleted BEFORE session
 * rows. The dangerous case is an `approved`-but-not-yet-redeemed deviceCode:
 * if session rows are deleted first, the device's next `/device/token` poll
 * finds the approved code and mints a fresh session, immediately re-granting
 * the just-revoked access. Deleting deviceCode rows first eliminates that
 * bypass. Both deletes are wrapped in a single transaction so a failure leaves
 * neither table in a partially-deleted state.
 *
 * All deviceCode statuses are deleted (not just 'pending') — the approved
 * status is precisely the dangerous one (data-model.md §Entity 1, red-team
 * Security hygiene).
 *
 * Emits a structured audit log line (stdout, JSON) containing userId,
 * revokedCount, and timestamp. Session tokens are never logged.
 *
 * @param pool    - the auth pg.Pool (getAuthPool())
 * @param userId  - the user whose credentials are being revoked
 * @returns { revokedCount } total rows deleted (deviceCode + session combined)
 */
export async function revokeUserSessions(
  pool: Pool,
  userId: string
): Promise<{ revokedCount: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let revokedCount = 0;

    try {
      // 1. Delete ALL deviceCode rows for this user first (ALL statuses) to
      //    close the approved-but-not-yet-redeemed race window before touching
      //    session rows. A concurrent /device/token poll that arrives between
      //    these two deletes will find no redeemable code and cannot create a
      //    surviving session.
      const deviceCodeResult = await client.query<never>(
        `DELETE FROM "deviceCode" WHERE "userId" = $1`,
        [userId]
      );
      revokedCount += deviceCodeResult.rowCount ?? 0;

      // 2. Delete all session rows (each row = one paired device or web login).
      const sessionResult = await client.query<never>(`DELETE FROM "session" WHERE "userId" = $1`, [
        userId,
      ]);
      revokedCount += sessionResult.rowCount ?? 0;

      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors — the original error is more important
      }
      throw err;
    }

    // Structured audit log — userId and revokedCount only, never session tokens.
    console.log(
      JSON.stringify({
        event: "admin.revokeUserSessions",
        userId,
        revokedCount,
        timestamp: new Date().toISOString(),
      })
    );

    return { revokedCount };
  } finally {
    client.release();
  }
}
