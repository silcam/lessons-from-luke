import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { isNewLanguage } from "../../core/models/Language";
import { Persistence } from "../../core/interfaces/Persistence";
import { unset, objFilter } from "../../core/util/objectUtils";
import importUsfm from "../usfm/importUsfm";

export default function languagesController(
  app: Express,
  storage: Persistence
) {
  addGetHandler(app, "/api/languages", async req => {
    return (await storage.languages()).map(lang => unset(lang, "code"));
  });

  addGetHandler(app, "/api/admin/languages", async req => {
    return storage.languages();
  });

  addGetHandler(app, "/api/languages/code/:code", async req => {
    return storage.language({ code: req.params.code });
  });

  addPostHandler(app, "/api/admin/languages", async req => {
    const newLanguage = req.body;
    if (!isNewLanguage(newLanguage)) {
      throw { status: 422 };
    }
    return storage.createLanguage(newLanguage);
  });

  addPostHandler(app, "/api/admin/languages/:languageId", async req => {
    const langUpdate = objFilter(req.body, ["motherTongue"]);
    return storage.updateLanguage(parseInt(req.params.languageId), langUpdate);
  });

  addPostHandler(app, "/api/admin/languages/:languageId/usfm", async req => {
    const languageId = parseInt(req.params.languageId);
    const { errors } = await importUsfm(req.body.usfm, languageId, storage);
    const language = await storage.language({ languageId });
    if (!language) throw { status: 404 };
    return { language, errors };
  });
}
