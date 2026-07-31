import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { isNewLanguage } from "../../core/models/Language";
import { Persistence } from "../../core/interfaces/Persistence";
import { unset, objFilter } from "../../core/util/objectUtils";
import importUsfm from "../usfm/importUsfm";
import defaultTranslations from "../actions/defaultTranslations";

const MAX_LANGUAGE_NAME_LENGTH = 100;
// eslint-disable-next-line no-control-regex
const C0_C1_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

export default function languagesController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/languages", async (_req) => {
    return (await storage.languages()).map((lang) => unset(lang, "code"));
  });

  addGetHandler(app, "/api/admin/languages", async (_req) => {
    return storage.languages();
  });

  addGetHandler(app, "/api/languages/code/:code", async (req) => {
    return storage.language({ code: req.params.code });
  });

  addPostHandler(app, "/api/admin/languages", async (req) => {
    const newLanguage = req.body;
    if (!isNewLanguage(newLanguage)) {
      throw { status: 422 };
    }
    const existing = await storage.languages();
    const duplicate = existing.some(
      (lang) => lang.name.toLowerCase() === newLanguage.name.toLowerCase()
    );
    if (duplicate) throw { status: 409 };
    const language = await storage.createLanguage(newLanguage);
    defaultTranslations(storage, language.languageId);
    return language;
  });

  addPostHandler(app, "/api/admin/languages/:languageId", async (req) => {
    const languageId = parseInt(req.params.languageId);
    const langUpdate = objFilter(req.body, ["motherTongue", "defaultSrcLang", "name"]);
    if ("name" in langUpdate) {
      if (typeof langUpdate.name !== "string") throw { status: 422 };
      const trimmed = langUpdate.name.trim();
      if (trimmed.length === 0) throw { status: 422 };
      if (trimmed.length > MAX_LANGUAGE_NAME_LENGTH) throw { status: 422 };
      if (C0_C1_CONTROL_CHARS.test(trimmed)) throw { status: 422 };

      const target = await storage.language({ languageId });
      if (!target || target.archived) throw { status: 404 };

      const existing = await storage.languages();
      const duplicate = existing.some(
        (lang) =>
          lang.languageId !== languageId &&
          !lang.archived &&
          (lang.name ?? "").toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) throw { status: 409 };

      langUpdate.name = trimmed;
    }
    return storage.updateLanguageChecked(languageId, langUpdate);
  });

  addPostHandler(app, "/api/admin/languages/:languageId/usfm", async (req) => {
    const languageId = parseInt(req.params.languageId);
    const { errors, tStrings } = await importUsfm(req.body.usfm, languageId, storage);
    const language = await storage.language({ languageId });
    if (!language) throw { status: 404 };
    return { language, tStrings, errors };
  });

  addPostHandler(app, "/api/admin/languages/:languageId/archive", async (req) => {
    const languageId = parseInt(req.params.languageId);
    return storage.archiveLanguage(languageId);
  });
}
