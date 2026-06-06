import { Request, Response, NextFunction } from "express";

// TODO(US2): Rewrite with better-auth session validation. This stub returns 401
// for all requests after cookie-session removal; better-auth middleware lands next.
export function isLoggedIn(_req: Request) {
  return false;
}

export default function requireUser(_req: Request, res: Response, _next: NextFunction) {
  res.status(401).send("Not logged in");
}
