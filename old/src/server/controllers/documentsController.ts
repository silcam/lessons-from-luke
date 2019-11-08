import { Express } from "express";
import documentPathForTranslation from "../actions/documentPathForTranslation";
import { documentPathForSource } from "../FileStorage";
import { sourceLessonIdFromString } from "../../core/Source";
import { projectIdFromString } from "../../core/Project";

export default function documentsController(app: Express) {
  app.get("/documents/source/:lessonFilename", (req, res) => {
    const lessonIdStr = stripOdtExtension(req.params.lessonFilename);
    const lessonId = sourceLessonIdFromString(lessonIdStr);
    const docPath = documentPathForSource(lessonId);
    res.sendFile(docPath);
  });

  app.get("/documents/translation/:projectId/:lessonFilename", (req, res) => {
    const lesson = lessonFromProjectFilename(req.params.lessonFilename);
    const projectId = projectIdFromString(req.params.projectId);
    const docPath = documentPathForTranslation(projectId, lesson);
    res.sendFile(docPath);
  });
}

function lessonFromProjectFilename(filename: string) {
  return stripOdtExtension(filename).replace(/^[^-]+-/, ""); // Remove "Ewondo-" from "Ewondo-Luke-T1-L01"
}

function stripOdtExtension(filename: string) {
  return filename.replace(/\.odt$/, "");
}
