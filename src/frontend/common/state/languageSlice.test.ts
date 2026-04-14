import languageSlice, {
  loadLanguages,
  loadTranslatingLanguage,
  pushLanguage,
  pushLanguageUpdate,
  pushUsfm
} from "./languageSlice";
import { Language, MaybePublicLanguage } from "../../../core/models/Language";
import { TString } from "../../../core/models/TString";

function makeLanguage(overrides: Partial<Language> = {}): Language {
  return {
    languageId: 1,
    name: "English",
    code: "en",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
    ...overrides
  };
}

function makeTString(overrides: Partial<TString> = {}): TString {
  return {
    masterId: 1,
    languageId: 1,
    text: "Hello",
    history: [],
    ...overrides
  };
}

describe("languageSlice reducers", () => {
  const initialState = { languages: [], adminLanguages: [] };

  describe("setLanguages", () => {
    it("sets languages and sorts by name", () => {
      const langZ = makeLanguage({ languageId: 2, name: "Zulu", code: "zu" });
      const langA = makeLanguage({ languageId: 3, name: "Arabic", code: "ar" });
      const langE = makeLanguage({ languageId: 1, name: "English", code: "en" });

      const state = languageSlice.reducer(
        initialState,
        languageSlice.actions.setLanguages([langZ, langA, langE])
      );

      expect(state.languages.map(l => l.name)).toEqual(["Arabic", "English", "Zulu"]);
    });

    it("replaces previous languages", () => {
      const stateWithLanguages = {
        ...initialState,
        languages: [makeLanguage({ languageId: 99, name: "Old" })] as MaybePublicLanguage[]
      };
      const newLang = makeLanguage({ languageId: 1, name: "New" });

      const state = languageSlice.reducer(
        stateWithLanguages,
        languageSlice.actions.setLanguages([newLang])
      );

      expect(state.languages).toHaveLength(1);
      expect(state.languages[0].name).toBe("New");
    });
  });

  describe("setAdminLanguages", () => {
    it("sets adminLanguages and sorts by name", () => {
      const langZ = makeLanguage({ languageId: 2, name: "Zulu", code: "zu" });
      const langA = makeLanguage({ languageId: 3, name: "Arabic", code: "ar" });

      const state = languageSlice.reducer(
        initialState,
        languageSlice.actions.setAdminLanguages([langZ, langA])
      );

      expect(state.adminLanguages.map(l => l.name)).toEqual(["Arabic", "Zulu"]);
    });
  });

  describe("addLanguage", () => {
    it("adds a new language to adminLanguages in sorted order", () => {
      const existing = makeLanguage({ languageId: 2, name: "Zulu", code: "zu" });
      const stateWithLanguages = {
        ...initialState,
        adminLanguages: [existing]
      };
      const newLang = makeLanguage({ languageId: 3, name: "Arabic", code: "ar" });

      const state = languageSlice.reducer(
        stateWithLanguages,
        languageSlice.actions.addLanguage(newLang)
      );

      expect(state.adminLanguages).toHaveLength(2);
      expect(state.adminLanguages.map(l => l.name)).toEqual(["Arabic", "Zulu"]);
    });

    it("replaces an existing language with matching languageId", () => {
      const existing = makeLanguage({ languageId: 1, name: "English", code: "en" });
      const stateWithLanguages = {
        ...initialState,
        adminLanguages: [existing]
      };
      const updated = makeLanguage({ languageId: 1, name: "English Updated", code: "en" });

      const state = languageSlice.reducer(
        stateWithLanguages,
        languageSlice.actions.addLanguage(updated)
      );

      expect(state.adminLanguages).toHaveLength(1);
      expect(state.adminLanguages[0].name).toBe("English Updated");
    });
  });

  describe("setTranslating", () => {
    it("sets the translating language", () => {
      const lang = makeLanguage({ languageId: 5, name: "Spanish", code: "es" });

      const state = languageSlice.reducer(
        initialState,
        languageSlice.actions.setTranslating(lang)
      );

      expect(state.translating).toEqual(lang);
    });
  });

  describe("setUsfmImportResult", () => {
    it("stores the USFM import result", () => {
      const lang = makeLanguage();
      const tStrings = [makeTString()];
      const errors = ["error1"];

      const state = languageSlice.reducer(
        initialState,
        languageSlice.actions.setUsfmImportResult({ language: lang, tStrings, errors })
      );

      expect(state.usfmImportResult).toEqual({ language: lang, tStrings, errors });
    });
  });

  describe("setProgress", () => {
    it("updates progress for the translating language", () => {
      const lang = makeLanguage({
        languageId: 1,
        progress: [{ lessonId: 1, progress: 50 }]
      });
      const stateWithTranslating = { ...initialState, translating: lang };

      const state = languageSlice.reducer(
        stateWithTranslating,
        languageSlice.actions.setProgress({ languageId: 1, lessonId: 1, progress: 80 })
      );

      expect(state.translating!.progress).toContainEqual({ lessonId: 1, progress: 80 });
      expect(state.translating!.progress).toHaveLength(1);
    });

    it("adds a new progress entry for a lesson not yet tracked", () => {
      const lang = makeLanguage({ languageId: 1, progress: [] });
      const stateWithTranslating = { ...initialState, translating: lang };

      const state = languageSlice.reducer(
        stateWithTranslating,
        languageSlice.actions.setProgress({ languageId: 1, lessonId: 42, progress: 75 })
      );

      expect(state.translating!.progress).toContainEqual({ lessonId: 42, progress: 75 });
    });

    it("logs an error and does not update if languageId does not match translating", () => {
      const lang = makeLanguage({ languageId: 1, progress: [] });
      const stateWithTranslating = { ...initialState, translating: lang };
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

      const state = languageSlice.reducer(
        stateWithTranslating,
        languageSlice.actions.setProgress({ languageId: 99, lessonId: 1, progress: 50 })
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(state.translating!.progress).toHaveLength(0);
      consoleSpy.mockRestore();
    });
  });
});

describe("languageSlice thunks", () => {
  describe("loadLanguages", () => {
    it("calls GET /api/languages and dispatches setLanguages when admin=false", async () => {
      const mockLang = makeLanguage();
      const get = jest.fn().mockResolvedValue([mockLang]);
      const dispatch = jest.fn();

      await loadLanguages(false)(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/languages", {});
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.setLanguages([mockLang])
      );
    });

    it("calls GET /api/admin/languages and dispatches setAdminLanguages when admin=true", async () => {
      const mockLang = makeLanguage();
      const get = jest.fn().mockResolvedValue([mockLang]);
      const dispatch = jest.fn();

      await loadLanguages(true)(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/admin/languages", {});
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.setAdminLanguages([mockLang])
      );
    });

    it("does not dispatch if GET returns null", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await loadLanguages(false)(get)(dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("loadTranslatingLanguage", () => {
    it("dispatches setTranslating and setLocaleIfNoUser on success", async () => {
      const mockLang = makeLanguage({ code: "fr", defaultSrcLang: 1 });
      const get = jest.fn().mockResolvedValue(mockLang);
      const dispatch = jest.fn();

      await loadTranslatingLanguage("fr")(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/languages/code/:code", { code: "fr" });
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.setTranslating(mockLang)
      );
      // Should also dispatch setLocaleIfNoUser
      expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it("does not dispatch if GET returns null", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await loadTranslatingLanguage("fr")(get)(dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("pushLanguage", () => {
    it("posts to /api/admin/languages and dispatches addLanguage", async () => {
      const newLang = { name: "Spanish", defaultSrcLang: 1 };
      const returnedLang = makeLanguage({ languageId: 10, name: "Spanish", code: "es" });
      const post = jest.fn().mockResolvedValue(returnedLang);
      const dispatch = jest.fn();

      const result = await pushLanguage(newLang)(post, dispatch);

      expect(post).toHaveBeenCalledWith("/api/admin/languages", {}, newLang);
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.addLanguage(returnedLang)
      );
      expect(result).toEqual(returnedLang);
    });

    it("returns null and does not dispatch if post returns null", async () => {
      const newLang = { name: "Spanish", defaultSrcLang: 1 };
      const post = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      const result = await pushLanguage(newLang)(post, dispatch);

      expect(dispatch).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("pushLanguageUpdate", () => {
    it("posts to /api/admin/languages/:languageId and dispatches addLanguage", async () => {
      const lang = makeLanguage({ languageId: 5, name: "French", code: "fr" });
      const updatedLang = { ...lang, name: "French Updated" };
      const post = jest.fn().mockResolvedValue(updatedLang);
      const dispatch = jest.fn();

      const result = await pushLanguageUpdate(lang)(post, dispatch);

      expect(post).toHaveBeenCalledWith(
        "/api/admin/languages/:languageId",
        { languageId: 5 },
        { motherTongue: lang.motherTongue, defaultSrcLang: lang.defaultSrcLang }
      );
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.addLanguage(updatedLang)
      );
      expect(result).toEqual(updatedLang);
    });
  });

  describe("pushUsfm", () => {
    it("posts USFM data and dispatches multiple actions on success", async () => {
      const lang = makeLanguage({ languageId: 3 });
      const tStrings = [makeTString({ languageId: 3 })];
      const usfmData = { language: lang, tStrings, errors: [] };
      const post = jest.fn().mockResolvedValue(usfmData);
      const dispatch = jest.fn();

      const result = await pushUsfm(3, "\\v 1 Hello")(post, dispatch);

      expect(post).toHaveBeenCalledWith(
        "/api/admin/languages/:languageId/usfm",
        { languageId: 3 },
        { usfm: "\\v 1 Hello" }
      );
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.addLanguage(lang)
      );
      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.setUsfmImportResult(usfmData)
      );
      expect(result).toEqual(usfmData);
    });

    it("returns null if post returns null", async () => {
      const post = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      const result = await pushUsfm(3, "\\v 1 Hello")(post, dispatch);

      expect(result).toBeNull();
    });
  });
});
