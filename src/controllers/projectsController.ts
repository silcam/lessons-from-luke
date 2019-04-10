import { Express } from "express";
import requireAdmin from "../util/requireAdmin";
import bodyParser from "body-parser";
import fileUpload, { UploadedFile } from "express-fileupload";
import uploadDocument from "../routes/uploadDocument";
import * as Storage from "../util/Storage";
import * as Manifest from "../util/Manifest";
import docStrings from "../routes/docStrings";
import layout from "../util/layout";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { encode } from "../util/timestampEncode";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function projectsController(app: Express) {
  app.post("/projects", requireAdmin, formDataParser, (req, res) => {
    const project = Manifest.addProject(
      req.body.sourceLang,
      req.body.targetLang
    );
    Storage.makeProjectDir(project);
    res.redirect(`/`);
  });

  // app.get("/view/:projectCode", (req, res) => {

  //   res.send(layout(viewProject()));
  // });
}
