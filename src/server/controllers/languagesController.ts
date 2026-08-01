import { Express } from "express";
import { addGetHandler, addPostHandler } from "../api/WebAPI";
import { isNewLanguage, describeLanguageNameError } from "../../core/models/Language";
import { Persistence } from "../../core/interfaces/Persistence";
import { unset, objFilter } from "../../core/util/objectUtils";
import importUsfm from "../usfm/importUsfm";
import defaultTranslations from "../actions/defaultTranslations";

/**
 * Validates a candidate language name shared by both the create and rename
 * endpoints, using the core single-source-of-truth classifier. Trims the
 * name and rejects empty, overlong, control-character, or
 * path-traversal-bearing names. Returns the trimmed name on success, or
 * throws { status: 422, body: { reason } } on failure, where `reason` is the
 * classifier's machine-readable rejection code, so callers can surface the
 * actual reason without re-deriving it client-side.
 */
function validateLanguageName(name: unknown): string {
  const reason = describeLanguageNameError(name);
  if (reason !== undefined) throw { status: 422, body: { reason } };
  return (name as string).trim();
}

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
    newLanguage.name = validateLanguageName(newLanguage.name);
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
      langUpdate.name = validateLanguageName(langUpdate.name);
    }
    // The 404 (nonexistent/archived target) and 409 (case-insensitive name
    // collision) checks both happen inside updateLanguageChecked's own
    // transaction, under FOR UPDATE row locks — see its comment for why
    // that's required to close the TOCTOU window between the check and the
    // write (lessons-from-luke-fm4a.9).
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
