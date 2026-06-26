import type { Request, Response, NextFunction } from "express";
import { isEnforcementEnabled } from "../util/enforcementFlag";
import requireUser from "./requireUser";

/**
 * Express middleware: conditionally enforces authentication based on the
 * ENFORCE_API_AUTH environment flag.
 *
 * When enforcement is OFF (flag absent, empty, or falsy): calls next()
 * immediately, preserving full backward-compatibility with the existing
 * open API.
 *
 * When enforcement is ON: delegates to requireUser, which accepts BOTH
 * a web session cookie and a desktop bearer token (the better-auth `bearer`
 * plugin makes getSession honour `Authorization: Bearer <token>`).
 *
 * US2 / FR-009 FR-010 FR-012
 *
 * @param req  - Express Request
 * @param res  - Express Response
 * @param next - Express NextFunction
 * @returns Promise<void>
 */
export default async function requireUserWhenEnforced(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isEnforcementEnabled()) {
    next();
    return;
  }
  await requireUser(req, res, next);
}
