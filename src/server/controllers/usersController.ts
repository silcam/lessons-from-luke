/**
 * usersController.ts — Admin account roster route
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002, §FR-010
 * Plan: contracts/user-admin-api.yaml paths./api/admin/users.get; plan.md §Project
 *       Structure (usersController.ts NEW, serverApp.ts EDIT)
 */
import { Express, Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { listAccounts } from "../auth/userStore";

/**
 * Registers admin user-account routes on the Express app.
 *
 * requireAdmin is already applied via app.use('/api/admin', requireAdmin) in
 * serverApp.ts before this controller is mounted.
 *
 * The `pool` argument is the auth-owned pg.Pool (same pool that better-auth
 * uses — passed in from serverApp.ts so this module stays free of singletons,
 * mirroring invitationController.ts).
 */
export default function usersController(app: Express, pool: Pool): void {
  // GET /api/admin/users — the account roster (US1, FR-001, FR-002, FR-010)
  // No CSRF check needed — read-only GET (mirrors GET /api/admin/invitations).
  app.get(
    "/api/admin/users",
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      let accounts;
      try {
        accounts = await listAccounts(pool);
      } catch (err) {
        next(err);
        return;
      }

      // Set Cache-Control: no-store (PII surface, mirrors GET /api/admin/invitations)
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json(
        accounts.map((account) => ({
          id: account.id,
          email: account.email,
          name: account.name,
          role: account.role,
          status: account.status,
          createdAt: account.createdAt.toISOString(),
          isSelf: account.id === req.user?.id,
        }))
      );
    }
  );
}
