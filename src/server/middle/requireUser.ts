import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { getAuth } from "../auth/auth";

/**
 * Load the better-auth session for the current request.
 *
 * Returns the session+user object if a valid session cookie is present,
 * or null if there is no session or the session store throws.
 *
 * Fails closed: any error from the session store is treated as
 * "no session" (never lets an error bypass authentication).
 *
 * Used by requireUser/requireAdmin and exported for testing.
 *
 * @deprecated - isLoggedIn stub below is kept for backward compatibility with
 * the pre-US2 requireUser.test.ts; it will be replaced by task 47t.5.6.1.
 */
export function isLoggedIn(_req: Request): boolean {
  return false;
}

export async function loadSession(req: Request) {
  try {
    const headers = fromNodeHeaders(req.headers);
    return await getAuth().api.getSession({ headers });
  } catch {
    return null;
  }
}

/**
 * Express middleware: requires a valid signed-in admin session.
 *
 * - No session → 401 Unauthorized
 * - Session exists but user.admin !== true → 403 Forbidden
 * - Session with admin → calls next()
 *
 * US2 / FR-004: distinguishes "not signed in" from "signed in but not admin".
 */
export default async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionData = await loadSession(req);

  if (!sessionData || !sessionData.user) {
    res.status(401).send("Not logged in");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(sessionData.user as any).admin) {
    res.status(403).send("Forbidden");
    return;
  }

  next();
}
