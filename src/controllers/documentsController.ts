import { Express } from "express";
import * as Storage from "../util/Storage";
import documentPathForTranslation from "../util/documentPathForTranslation";

export default function documentsController(app: Express) {
  app.get("/documents/source/:lessonFilename", (req, res) => {
    const lessonIdStr = stripOdtExtension(req.params.lessonFilename);
    const lessonId = Storage.lessonIdFromString(lessonIdStr);
    const docPath = Storage.documentPathForSource(lessonId);
    res.sendFile(docPath);
  });

  app.get("/documents/translation/:projectId/:lessonFilename", (req, res) => {
    const lesson = stripOdtExtension(req.params.lessonFilename);
    const projectId = Storage.projectIdFromString(req.params.projectId);
    const docPath = documentPathForTranslation(projectId, lesson);
    res.sendFile(docPath);
  });
}

function stripOdtExtension(filename: string) {
  return filename.replace(/\.odt$/, "");
}
