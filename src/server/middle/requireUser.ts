import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { getAuth, getAuthPool } from "../auth/auth";
import type { User } from "../../core/models/User";

// Augment Express Request with better-auth session fields.
// These are set by loadSession() and consumed by requireUser/requireAdmin.
declare module "express-serve-static-core" {
  interface Request {
    user?: User;
    authSession?: { id: string; userId: string; expiresAt: Date };
  }
}

/**
 * Load the better-auth session for the current request.
 *
 * When a valid session is present, populates req.user and req.authSession
 * and returns the raw session object from better-auth.
 *
 * Re-checks deactivation on every call (US2/FR-005, data-model.md
 * §Enforcement points): even though better-auth still considers the session
 * valid, a deactivated account's session is treated as unauthenticated —
 * `req.user`/`req.authSession` are left unset and this returns `null`. This
 * catches the "already in flight" edge case where a user is deactivated
 * mid-session (spec.md §Edge Cases).
 *
 * Fails closed: any error from the session store OR the deactivatedAt
 * lookup is treated as "no session" and returns null (never lets an error
 * bypass authentication). Errors are logged server-side without leaking
 * connection details.
 *
 * @param req - Express Request object (mutated in place when session exists)
 * @returns The raw better-auth session object, or null if no session, the
 *   account is deactivated, or on error
 */
export async function loadSession(req: Request): Promise<unknown> {
  try {
    const session = await getAuth().api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) {
      return null;
    }

    // Fail-closed deactivation check: any non-NULL deactivatedAt OR any
    // failure of the lookup itself resolves to "unauthenticated" — never
    // re-thrown, never silently treated as authenticated.
    try {
      const result = await getAuthPool().query<{ deactivatedAt: Date | null }>(
        `SELECT "deactivatedAt" FROM "user" WHERE id = $1`,
        [session.user.id]
      );
      if (result.rows.length === 0 || result.rows[0].deactivatedAt !== null) {
        return null;
      }
    } catch (err) {
      console.error("[requireUser] deactivatedAt lookup error:", (err as Error).message);
      return null;
    }

    req.user = {
      id: session.user.id,
      admin: Boolean((session.user as { admin?: boolean }).admin),
    };
    req.authSession = session.session as {
      id: string;
      userId: string;
      expiresAt: Date;
    };
    return session;
  } catch (err) {
    // Fail closed: log without leaking internals, leave req.user undefined
    console.error("[requireUser] session load error:", (err as Error).message);
    return null;
  }
}

/**
 * Express middleware: requires any valid signed-in session.
 *
 * - No session or session load error → 401 Unauthorized (JSON)
 * - Valid session → populates req.user and calls next()
 *
 * US2 / FR-004
 *
 * @param req - Express Request
 * @param res - Express Response
 * @param next - Express NextFunction
 * @returns Promise<void>
 */
export default async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  await loadSession(req);
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Express middleware: requires a valid signed-in admin session.
 *
 * - No session or session load error → 401 Unauthorized (JSON)
 * - Session exists but user.admin !== true → 403 Forbidden (JSON)
 * - Session with admin === true → calls next()
 *
 * US2 / FR-004: distinguishes "not signed in" from "signed in but not admin".
 *
 * @param req - Express Request
 * @param res - Express Response
 * @param next - Express NextFunction
 * @returns Promise<void>
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await loadSession(req);
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.admin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
