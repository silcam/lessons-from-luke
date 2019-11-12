import express from "express";
import sourcesController from "./controllers/sourcesController";
import usersController from "./controllers/usersController";
import cookieSession from "cookie-session";
import secrets from "./util/secrets";
import bodyParser from "body-parser";
// import sourcesController from "./controllers/sourcesController";

const app = express();

app.use(cookieSession({ secret: secrets.cookieSecret }));
app.use(bodyParser.json());

sourcesController(app);
usersController(app);

app.listen(8081, function() {
  console.log("Lessons from Luke API listening on port 8081.\n");
});
