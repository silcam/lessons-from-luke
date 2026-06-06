import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { LoginAttempt } from "../../core/models/User";

// TODO(US1): Replace with better-auth routes. This stub compiles cleanly after
// cookie-session removal; session-based auth is no longer available here.
export default function usersController(app: Express) {
  addGetHandler(app, "/api/users/current", async (_req) => {
    return null;
  });

  addPostHandler(app, "/api/users/login", async (req) => {
    const _loginAttempt: LoginAttempt = req.body;
    throw { status: 422 };
  });

  addPostHandler(app, "/api/users/logout", async (_req) => {
    return null;
  });
}
