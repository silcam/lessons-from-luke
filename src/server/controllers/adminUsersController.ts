/**
 * adminUsersController.ts — Admin user-management routes
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Plan: specs/004-desktop-auth-pairing/plan.md §Security Considerations
 *       (bearer widens admin surface — state-changing admin POSTs must be
 *       Origin-guarded so desktop bearer callers cannot reach them)
 * Contract: specs/004-desktop-auth-pairing/contracts/admin-revoke-api.yaml
 *
 * Routes:
 *   POST /api/admin/users/:userId/revoke-sessions — revoke all sessions for a user
 *
 * Auth: requireAdmin is applied globally via app.use('/api/admin', requireAdmin)
 *       in serverApp.ts. requireSameOrigin is applied both by the blanket POST
 *       guard in serverApp.ts AND explicitly per route (belt-and-suspenders).
 */

import { Express, Request, Response } from "express";
import { Pool } from "pg";
import { revokeUserSessions } from "../auth/sessionRevocation";
import { requireSameOrigin } from "../middle/requireSameOrigin";

/**
 * Registers admin user-management routes on the Express app.
 *
 * The `pool` argument is the auth-owned pg.Pool (getAuthPool()), passed from
 * serverApp.ts so this module stays free of singletons.
 */
export default function adminUsersController(app: Express, pool: Pool): void {
  // GET /api/admin/users — list all users for the admin revoke-device-access UI (US4.4)
  //
  // Requires admin session (requireAdmin gate in serverApp.ts).
  // Returns all users: { id, email, name, admin }[].
  app.get("/api/admin/users", async (req: Request, res: Response): Promise<void> => {
    let users: { id: string; email: string; name: string; admin: boolean }[];
    try {
      const result = await pool.query<{
        id: string;
        email: string;
        name: string;
        admin: boolean;
      }>(`SELECT id, email, name, admin FROM "user" ORDER BY email`);
      users = result.rows;
    } catch (err) {
      console.error("[adminUsersController] DB error listing users:", (err as Error).message);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json(users);
  });

  // POST /api/admin/users/:userId/revoke-sessions — revoke a user's device access (FR-017)
  //
  // Requires admin session (requireAdmin gate in serverApp.ts).
  // requireSameOrigin: 403s any request that lacks a matching Origin/Referer,
  // which includes desktop bearer callers (they carry no Origin header).
  // This is belt-and-suspenders on top of the blanket POST guard in serverApp.ts.
  app.post(
    "/api/admin/users/:userId/revoke-sessions",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { userId } = req.params;

      // Verify the user exists before attempting revocation.
      // A missing user → 404 rather than a silent 0-row success.
      let userExists: boolean;
      try {
        const result = await pool.query<{ id: string }>(
          `SELECT id FROM "user" WHERE id = $1 LIMIT 1`,
          [userId]
        );
        userExists = result.rows.length > 0;
      } catch (err) {
        console.error("[adminUsersController] DB error checking user:", (err as Error).message);
        res.status(500).json({ error: "Internal server error" });
        return;
      }

      if (!userExists) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Atomically delete all deviceCode and session rows for the user.
      // revokeUserSessions also emits the FR-021 structured audit log line.
      let revokedCount: number;
      try {
        const result = await revokeUserSessions(pool, userId);
        revokedCount = result.revokedCount;
      } catch (err) {
        console.error("[adminUsersController] DB error revoking sessions:", (err as Error).message);
        res.status(500).json({ error: "Internal server error" });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, revokedCount });
    }
  );
}
