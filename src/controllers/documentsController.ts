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
import updateSrcStrings from "../util/updateSrcStrings";

const formDataParser = bodyParser.urlencoded({ extended: false });

export default function documentsController(app: Express) {
  app.get("/documents/source/:lessonId", (req, res) => {
    const lessonId = Storage.lessonIdFromString(req.params.lessonId);
    const docPath = Storage.documentPathForSource(lessonId);
    res.sendFile(docPath, { root: "./" });
  });
}
