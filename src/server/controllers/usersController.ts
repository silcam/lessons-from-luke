/**
 * usersController.ts — Admin account roster + deactivate/reactivate routes
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §US2, §FR-001,
 *       §FR-002, §FR-005..FR-008, §FR-010, §FR-011
 * Plan: contracts/user-admin-api.yaml paths./api/admin/users.get,
 *       ./api/admin/users/{id}/deactivate, ./{id}/reactivate; plan.md §Project
 *       Structure (usersController.ts NEW, serverApp.ts EDIT), §Security
 *       Considerations ("Administrative action audit trail")
 */
import { Express, Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import {
  listAccounts,
  deactivateAccount,
  reactivateAccount,
  changeRole,
  revokeSessions,
} from "../auth/userStore";
import {
  UserNotFoundError,
  LastAdminError,
  SelfDeactivationError,
  InvalidRoleError,
  parseAccountRole,
} from "../auth/userValidation";
import { requireSameOrigin } from "../middle/requireSameOrigin";

/**
 * Emits a structured server-side audit log line for a mutating admin action
 * (deactivate/reactivate), per plan.md §Security Considerations
 * ("Administrative action audit trail"). No new table/column — log-only,
 * kept lightweight (Simplicity VII).
 */
function logAdminAction(entry: {
  action: "deactivate" | "reactivate" | "role-change" | "revoke-sessions";
  adminId: string;
  userId: string;
  outcome: "applied" | "refused-last-admin" | "refused-self";
  role?: string;
  revoked?: number;
}): void {
  console.log(
    JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    })
  );
}

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

  // POST /api/admin/users/:id/deactivate — deactivate an account (US2,
  // FR-005, FR-007, FR-008, FR-010, FR-011)
  // Apply CSRF middleware (state-changing POST — mirrors
  // POST /api/admin/invitations/:id/retract).
  app.post(
    "/api/admin/users/:id/deactivate",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const adminId = req.user?.id ?? "unknown";

      let account;
      try {
        account = await deactivateAccount(pool, adminId, id);
      } catch (err) {
        if (err instanceof SelfDeactivationError) {
          logAdminAction({
            action: "deactivate",
            adminId,
            userId: id,
            outcome: "refused-self",
          });
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        if (err instanceof LastAdminError) {
          logAdminAction({
            action: "deactivate",
            adminId,
            userId: id,
            outcome: "refused-last-admin",
          });
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        if (err instanceof UserNotFoundError) {
          res.status(404).json({ error: err.message, code: err.code });
          return;
        }
        // Unexpected error — generic 500 body only (no SQL/stack/driver text).
        res.status(500).json({ error: "An unexpected error occurred" });
        return;
      }

      logAdminAction({ action: "deactivate", adminId, userId: id, outcome: "applied" });

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        status: account.status,
        createdAt: account.createdAt.toISOString(),
        isSelf: account.id === req.user?.id,
      });
    }
  );

  // POST /api/admin/users/:id/reactivate — reactivate a deactivated account
  // (US2, FR-006)
  // Apply CSRF middleware (state-changing POST — mirrors
  // POST /api/admin/invitations/:id/retract).
  app.post(
    "/api/admin/users/:id/reactivate",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const adminId = req.user?.id ?? "unknown";

      let account;
      try {
        account = await reactivateAccount(pool, id);
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          res.status(404).json({ error: err.message, code: err.code });
          return;
        }
        // Unexpected error — generic 500 body only (no SQL/stack/driver text).
        res.status(500).json({ error: "An unexpected error occurred" });
        return;
      }

      logAdminAction({ action: "reactivate", adminId, userId: id, outcome: "applied" });

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        status: account.status,
        createdAt: account.createdAt.toISOString(),
        isSelf: account.id === req.user?.id,
      });
    }
  );

  // POST /api/admin/users/:id/role — promote/demote an account (US3, FR-003,
  // FR-004, FR-010)
  // Apply CSRF middleware (state-changing POST — mirrors
  // POST /api/admin/users/:id/deactivate).
  app.post(
    "/api/admin/users/:id/role",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const adminId = req.user?.id ?? "unknown";

      let newRole;
      try {
        newRole = parseAccountRole((req.body as { role?: unknown } | undefined)?.role);
      } catch (err) {
        if (err instanceof InvalidRoleError) {
          res.status(400).json({ error: err.message, code: err.code });
          return;
        }
        res.status(500).json({ error: "An unexpected error occurred" });
        return;
      }

      let account;
      try {
        account = await changeRole(pool, id, newRole);
      } catch (err) {
        if (err instanceof LastAdminError) {
          logAdminAction({
            action: "role-change",
            adminId,
            userId: id,
            outcome: "refused-last-admin",
            role: newRole,
          });
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        if (err instanceof UserNotFoundError) {
          res.status(404).json({ error: err.message, code: err.code });
          return;
        }
        // Unexpected error — generic 500 body only (no SQL/stack/driver text).
        res.status(500).json({ error: "An unexpected error occurred" });
        return;
      }

      logAdminAction({
        action: "role-change",
        adminId,
        userId: id,
        outcome: "applied",
        role: newRole,
      });

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        status: account.status,
        createdAt: account.createdAt.toISOString(),
        isSelf: account.id === req.user?.id,
      });
    }
  );

  // POST /api/admin/users/:id/revoke-sessions — force sign-out without
  // deactivating (US4, FR-009, FR-010, FR-011). No self-exclusion — a
  // self-targeted force-sign-out is a legitimate action (see US4
  // Implementation Constraints / red-team note on the parent issue).
  // Apply CSRF middleware (state-changing POST — mirrors
  // POST /api/admin/users/:id/deactivate).
  app.post(
    "/api/admin/users/:id/revoke-sessions",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const adminId = req.user?.id ?? "unknown";

      let result;
      try {
        result = await revokeSessions(pool, id);
      } catch (err) {
        if (err instanceof UserNotFoundError) {
          res.status(404).json({ error: err.message, code: err.code });
          return;
        }
        // Unexpected error — generic 500 body only (no SQL/stack/driver text).
        res.status(500).json({ error: "An unexpected error occurred" });
        return;
      }

      logAdminAction({
        action: "revoke-sessions",
        adminId,
        userId: id,
        outcome: "applied",
        revoked: result.revoked,
      });

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        status: result.status,
        createdAt: result.createdAt.toISOString(),
        isSelf: result.id === req.user?.id,
        revoked: result.revoked,
      });
    }
  );
}
