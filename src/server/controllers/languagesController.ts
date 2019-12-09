import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { NewLanguage, isNewLanguage } from "../../core/models/Language";
import { Persistence } from "../../core/interfaces/Persistence";
import { unset } from "../../core/util/objectUtils";

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
}
