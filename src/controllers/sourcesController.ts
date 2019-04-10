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

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function sourcesController(app: Express) {
  app.post("/sources", requireAdmin, formDataParser, (req, res) => {
    Manifest.addSourceLanguage(req.body.language);
    Storage.makeLangDir(req.body.language);
    res.redirect(`/sources/${req.body.language}`);
  });

  app.get("/sources/:language", requireAdmin, (req, res) => {
    const langManifest = Manifest.readSourceManifest(req.params.language);
    res.send(layout(Mustache.render(getTemplate("sourceLang"), langManifest)));
  });

  app.post(
    "/sources/:language",
    requireAdmin,
    formDataParser,
    fileUpload(),
    async (req, res) => {
      const file = req.files.document as UploadedFile;
      const lessonId = await uploadDocument(
        req.params.language,
        req.body.series,
        file
      );
      res.redirect(
        `/sources/${req.params.language}/lessons/${lessonId.lesson}/versions/${
          lessonId.version
        }`
      );
    }
  );

  app.get(
    "/sources/:language/lessons/:lesson/versions/:version",
    requireAdmin,
    async (req, res) => {
      res.send(layout(docStrings(req.params)));
    }
  );
}
