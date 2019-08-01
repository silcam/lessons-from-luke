import { Express } from "express";
import * as Storage from "../util/Storage";

export default function documentsController(app: Express) {
  app.get("/documents/source/:lessonId", (req, res) => {
    const lessonId = Storage.lessonIdFromString(req.params.lessonId);
    const docPath = Storage.documentPathForSource(lessonId);
    res.sendFile(docPath);
  });

  app.get("/documents/translation/:projectId/:lesson", (req, res) => {
    const projectId = Storage.projectIdFromString(req.params.projectId);
    const docPath = Storage.documentPathForTranslation(
      projectId,
      req.params.lesson
    );
    res.sendFile(docPath);
  });
}
