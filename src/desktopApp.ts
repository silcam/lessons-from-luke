import express, { Response } from "express";
import layout from "./util/layout";
import translateController from "./controllers/translateController";
import catchError from "./util/catchError";
import handle404 from "./util/handle404";
import { getTemplate } from "./util/getTemplate";
import bodyParser from "body-parser";
import { fetch } from "./util/desktopSync";
import * as Manifest from "./util/Manifest";
import { encode } from "./util/timestampEncode";
import Mustache from "mustache";
import { assetsPath } from "./util/fsUtils";

const app = express();
app.use(express.static(assetsPath("public")));
const formDataParser = bodyParser.urlencoded({ extended: false });

app.get("/", (req, res) => {
  if (Manifest.desktopProjectManifestExists()) {
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

translateController(app);

app.use(handle404);

app.use(catchError);

function redirectToProject(res: Response) {
  const project = Manifest.readDesktopProject();
  res.redirect(`/translate/${encode(project.datetime)}`);
}

export default app;
