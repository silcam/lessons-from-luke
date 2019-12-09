import { Request, Response, NextFunction } from "express";
import { GetRoute, PostRoute } from "../../core/interfaces/Api";

export function isLoggedIn(req: Request) {
  return !!(req.session && req.session.userId);
}

// const getLoginExceptions: GetRoute[] = [];

// const postLoginExceptions: PostRoute[] = [
//   "/api/users/login",
//   "/api/users/logout"
// ];

// function loginNotRequired(req: Request) {
//   const exceptions: string[] =
//     req.method === "POST" ? postLoginExceptions : getLoginExceptions;
//   return exceptions.includes(req.route.path);
// }

export default function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (isLoggedIn(req)) {
    next();
  } else {
    res.status(401).send("Not logged in");
  }
}
