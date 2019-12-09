import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { isNewLanguageLesson } from "../../core/models/LanguageLesson";
import { isWithCode } from "../../core/models/Language";

export default function lessonsController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/lessons", async req => {
    return storage.lessons();
  });

  addGetHandler(app, "/api/languages/:languageId/lessonVersions", async req => {
    return storage.lessonVersions(parseInt(req.params.languageId));
  });

  addPostHandler(app, "/api/languageLessons", async req => {
    if (!isWithCode(req.body, isNewLanguageLesson)) throw { status: 422 };
    const { code, ...newLanguageLesson } = req.body;
    if (await storage.invalidCode(code, newLanguageLesson.languageId))
      throw { status: 401 };
    try {
      await storage.createLanguageLesson(newLanguageLesson);
      return storage.lessonVersions(newLanguageLesson.languageId);
    } catch (err) {
      if (err.type == "TestDB") throw { status: 422 };
      throw { status: 500 };
    }
  });
}
