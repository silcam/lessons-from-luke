import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { getAuth } from "../auth/auth";
import type { User } from "../../core/models/User";

// Augment Express Request with better-auth session fields.
// These are set by loadSession() and consumed by requireUser/requireAdmin.
declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

/**
 * Load the better-auth session for the current request.
 *
 * When a valid session is present, populates req.user and returns the raw
 * session object from better-auth.
 *
 * Fails closed: any error from the session store is treated as
 * "no session" and returns null (never lets an error bypass authentication).
 * The error is logged server-side without leaking connection details.
 *
 * @param req - Express Request object (mutated in place when session exists)
 * @returns The raw better-auth session object, or null if no session or on error
 */
export async function loadSession(req: Request): Promise<unknown> {
  try {
    const session = await getAuth().api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session) {
      req.user = {
        id: session.user.id,
        admin: Boolean((session.user as { admin?: boolean }).admin),
      };
    }
    return session ?? null;
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
