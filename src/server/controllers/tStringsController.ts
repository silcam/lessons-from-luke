import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { isTString } from "../../core/models/TString";
import { isWithCode } from "../../core/models/Language";

export default function tStringsController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/languages/:languageId/tStrings", async req => {
    return storage.tStrings({ languageId: parseInt(req.params.languageId) });
  });

  addGetHandler(
    app,
    "/api/languages/:languageId/lessons/:lessonId/tStrings",
    async req => {
      return storage.tStrings({
        languageId: parseInt(req.params.languageId),
        lessonId: parseInt(req.params.lessonId)
      });
    }
  );

  addPostHandler(app, "/api/tStrings", async req => {
    if (!isWithCode(req.body, isTString)) throw { status: 422 };
    const { code, ...tString } = req.body;
    if (await storage.invalidCode(code, tString.languageId))
      throw { status: 401 };
    return storage.saveTString(tString);
  });
}
