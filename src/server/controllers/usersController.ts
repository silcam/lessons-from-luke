import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import secrets from "../util/secrets";
import { LoginAttempt } from "../../core/User";

export default function usersController(app: Express) {
  addGetHandler(app, "/api/users/current", async req => {
    return req.session?.userId ? { id: req.session.userId } : null;
  });

  addPostHandler(app, "/api/users/login", async req => {
    const loginAttempt: LoginAttempt = req.body;
    if (
      loginAttempt.username === secrets.adminUsername &&
      loginAttempt.password === secrets.adminPassword
    ) {
      req.session!.userId = 1;
      return { id: 1 };
    }
    return null;
  });

  addPostHandler(app, "/api/users/logout", async req => {
    req.session!.userId = undefined;
    return null;
  });
}
