import express from "express";
import adminHome from "./routes/adminHome";
import publicHome from "./routes/publicHome";
import cookieSession from "cookie-session";
import bodyParser from "body-parser";
import secrets from "./util/secrets";
import authenticate from "./util/authenticate";
import { isAdmin } from "./util/requireAdmin";
import layout from "./util/layout";
import sourcesController from "./controllers/sourcesController";
import translateController from "./controllers/translateController";
import projectsController from "./controllers/projectsController";
import errorTestController from "./controllers/errorTestController";
import catchError from "./util/catchError";
import handle404 from "./util/handle404";

const app = express();
app.use(express.static("public"));
app.use(cookieSession({ secret: secrets.cookieSecret }));
const formDataParser = bodyParser.urlencoded({ extended: false });

app.get("/", (req, res) => {
  if (isAdmin(req)) res.send(layout(adminHome()));
  else res.send(layout(publicHome(req.query)));
});

app.post("/login", formDataParser, (req, res) => {
  if (authenticate(req.body)) {
    req.session.admin = true;
    res.redirect("/");
  } else {
    res.redirect("/?failedLogin=true");
  }
});

sourcesController(app);

projectsController(app);

translateController(app);

errorTestController(app);

app.use(handle404);

app.use(catchError);

export default app;
