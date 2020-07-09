import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { Persistence } from "../../core/interfaces/Persistence";
import { isTString, TString } from "../../core/models/TString";

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

  addGetHandler(app, "/api/languages/:languageId/tStrings/:ids", async req => {
    const languageId = parseInt(req.params.languageId);
    if (!languageId) throw { status: 400 };
    const masterIds = req.params.ids.split(",").map(id => {
      const val = parseInt(id);
      if (!val) throw { status: 400 };
      return val;
    });
    return storage.tStrings({ languageId, masterIds });
  });

  addPostHandler(app, "/api/tStrings", async req => {
    const { code, tStrings } = validateTStringPost(req.body);
    if (
      await storage.invalidCode(
        code,
        tStrings.map(tStr => tStr.languageId)
      )
    )
      throw { status: 401 };
    return storage.saveTStrings(tStrings);
  });
}

function validateTStringPost(body: {
  code: unknown;
  tStrings: unknown;
}): { code: string; tStrings: TString[] } {
  const { code, tStrings } = body;
  if (!(typeof code === "string") || !Array.isArray(tStrings))
    throw { status: 422 };
  if (!tStrings.every(tStr => isTString(tStr))) throw { status: 422 };
  if (tStrings.length == 0) throw { status: 422 };

  return { code, tStrings };
}
