import express, { Response } from "express";
import layout from "./util/layout";
import translateController from "./controllers/translateController";
import catchError from "./util/catchError";
import handle404 from "./util/handle404";
import { getTemplate } from "./util/getTemplate";
import bodyParser from "body-parser";
import { fetch, getSyncStatus, push } from "./util/desktopSync";
import * as Manifest from "./util/Manifest";
import { encode } from "./util/timestampEncode";
import Mustache from "mustache";
import { assetsPath } from "./util/fsUtils";

const formDataParser = bodyParser.urlencoded({ extended: false });

const app = express();
app.use(express.static(assetsPath("public")));

app.use((req, res, next) => {
  const syncStatus = getSyncStatus();
  if (syncStatus.writeLockInvalid) {
    res.send(layout(Mustache.render(getTemplate("writeLockInvalid"), {})));
  } else {
    next();
  }
});

app.get("/", async (req, res) => {
  if (Manifest.desktopProjectManifestExists()) {
    if (getSyncStatus().needToSync) await push();
    redirectToProject(res);
  } else {
    const errorMessage = req.query.failedSync ? "Sorry, that didn't work." : "";
    res.send(
      layout(Mustache.render(getTemplate("desktopHome"), { errorMessage }))
    );
  }
});

app.post("/fetch", formDataParser, async (req, res) => {
  const codeOrUrl: string = req.body.code;
  const code = codeOrUrl.includes("/")
    ? codeOrUrl.substr(codeOrUrl.lastIndexOf("/") + 1)
    : codeOrUrl;
  try {
    await fetch(code);
    redirectToProject(res);
  } catch (err) {
    console.error(err);
    res.redirect("/?failedSync=true");
  }
});

translateController(app, "desktop");

app.use(handle404);

app.use(catchError);

function redirectToProject(res: Response) {
  const project = Manifest.readDesktopProject();
  res.redirect(`/translate/${encode(project.datetime)}`);
}

export default app;
