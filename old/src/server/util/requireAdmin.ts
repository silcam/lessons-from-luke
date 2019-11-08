import { Request, Response, NextFunction } from "express";

export function isAdmin(req: Request) {
  return !!(req.session && req.session.admin);
}

export default function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!isAdmin(req)) {
    res.redirect("/");
  } else {
    next();
  }
}
