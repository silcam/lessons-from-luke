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
import PGStorage, { PGTestStorage } from "./storage/PGStorage";

const PRODUCTION = process.env.NODE_ENV == "production";

function serverApp(opts: { silent?: boolean } = {}) {
  const app = express();
  const storage = PRODUCTION ? new PGStorage() : new PGTestStorage();

  app.use(cookieSession({ secret: secrets.cookieSecret }));
  app.use(bodyParser.json({ limit: "2MB" }));
  app.use("/api/admin", requireUser);

  if (PRODUCTION) {
    app.use(express.static("dist/frontend"));
  }

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

  if (!PRODUCTION) {
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
