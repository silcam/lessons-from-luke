import express from "express";
import usersController from "./controllers/usersController";
import cookieSession from "cookie-session";
import secrets from "./util/secrets";
import bodyParser from "body-parser";
import testStorage from "./storage/testStorage";
import languagesController from "./controllers/languagesController";
import lessonsController from "./controllers/lessonsController";
import requireUser from "./middle/requireUser";
import tStringsController from "./controllers/tStringsController";
import { Persistence } from "../core/interfaces/Persistence";
import testController from "./controllers/testController";
import lessonStringsController from "./controllers/lessonStringsController";

function serverApp(opts: { silent?: boolean; testController?: boolean } = {}) {
  const app = express();
  const storage: Persistence = testStorage;

  app.use(cookieSession({ secret: secrets.cookieSecret }));
  app.use(bodyParser.json());
  app.use("/api/admin", requireUser);

  // Simulate slow server
  // app.use((res, req, next) => {
  //   setTimeout(next, 2000);
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
  lessonStringsController(app, storage);
  tStringsController(app, storage);

  if (opts.testController) {
    testController(app, storage);
  }

  return app;
}

export default serverApp;
