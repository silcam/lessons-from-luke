import { Express } from "express";
import { Persistence } from "../../core/interfaces/Persistence";
import { addGetHandler } from "../api/WebAPI";

export default function lessonStringsController(
  app: Express,
  storage: Persistence
) {
  addGetHandler(app, "/api/languages/:languageId/lessonStrings", async req => {
    return storage.lessonStrings({
      languageId: parseInt(req.params.languageId)
    });
  });

  addGetHandler(
    app,
    "/api/lessonVersions/:lessonVersionId/lessonStrings",
    async req => {
      return storage.lessonStrings({
        lessonVersionId: parseInt(req.params.lessonVersionId)
      });
    }
  );
}
