import express from "express";
import usersController from "./controllers/usersController";
import cookieSession from "cookie-session";
import secrets from "./util/secrets";
import bodyParser from "body-parser";
import languagesController from "./controllers/languagesController";
import lessonsController from "./controllers/lessonsController";
import requireUser from "./middle/requireUser";
import tStringsController from "./controllers/tStringsController";
import testController from "./controllers/testController";
import documentsController from "./controllers/documentsController";
import PGStorage, { PGTestStorage, PGDevStorage } from "./storage/PGStorage";
import { Persistence } from "../core/interfaces/Persistence";
import docStorage from "./storage/docStorage";
import syncController from "./controllers/syncController";

const PRODUCTION = process.env.NODE_ENV == "production";

function serverApp(opts: { silent?: boolean; storage?: Persistence } = {}) {
  const app = express();
  const storage =
    opts.storage ??
    (PRODUCTION
      ? new PGStorage()
      : process.env.NODE_ENV === "test"
        ? new PGTestStorage()
        : new PGDevStorage());

  if (!opts.storage && !PRODUCTION && !opts.silent) {
    const cls = process.env.NODE_ENV === "test" ? "PGTestStorage" : "PGDevStorage";
    console.log(`[serverApp] NODE_ENV=${process.env.NODE_ENV} storage=${cls}`);
  }

  // Casts needed: @types/connect's NextHandleFunction is incompatible with @types/node@20 ServerResponse types
  app.use(cookieSession({ secret: secrets.cookieSecret }) as any);
  app.use(bodyParser.json({ limit: "2MB" }) as any);
  app.use("/api/admin", requireUser);

  if (PRODUCTION) {
    app.use(express.static("dist/frontend"));
  }

  app.use("/webified", express.static(docStorage.webifyPath()));

  // Simulate slow server
  // app.use((res, req, next) => {
  //   setTimeout(next, 1000);
  // });

  if (!opts.silent) {
    app.use((req, res, next) => {
      res.on("finish", () => {
        console.log(`${req.method} ${req.path} => [${res.statusCode}]`);
      });
      next();
    });
  }

  usersController(app);
  languagesController(app, storage);
  lessonsController(app, storage);
  tStringsController(app, storage);
  documentsController(app, storage);
  syncController(app, storage);

  if (process.env.NODE_ENV === "test") {
    testController(app, storage as PGTestStorage);
  }

  if (PRODUCTION) {
    // Handle client-side routes
    app.get("*", (req, res) => {
      res.sendFile(`${process.cwd()}/dist/frontend/index.html`);
    });
  }

  return app;
}

export default serverApp;
