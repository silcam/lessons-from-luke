import tStringSlice, { loadTStrings, pushTStrings } from "./tStringSlice";
import { TString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";

function makeTString(overrides: Partial<TString> = {}): TString {
  return {
    masterId: 1,
    languageId: 1,
    text: "Hello",
    history: [],
    ...overrides
  };
}

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

describe("tStringSlice reducers", () => {
  const initialState: TString[] = [];

  describe("add", () => {
    it("adds tStrings to empty state", () => {
      const tStr = makeTString({ masterId: 1, languageId: 1 });

      const state = tStringSlice.reducer(
        initialState,
        tStringSlice.actions.add([tStr])
      );

      expect(state).toHaveLength(1);
      expect(state[0]).toEqual(tStr);
    });

    it("merges without duplicating by masterId+languageId+lessonStringId", () => {
      const tStr = makeTString({ masterId: 1, languageId: 1, text: "Hello" });
      const stateWithString = tStringSlice.reducer(
        initialState,
        tStringSlice.actions.add([tStr])
      );

      const updated = makeTString({ masterId: 1, languageId: 1, text: "Updated" });

      const state = tStringSlice.reducer(
        stateWithString,
        tStringSlice.actions.add([updated])
      );

      expect(state).toHaveLength(1);
      expect(state[0].text).toBe("Updated");
    });

    it("adds multiple tStrings at once", () => {
      const strings = [
        makeTString({ masterId: 1, languageId: 1 }),
        makeTString({ masterId: 2, languageId: 1 }),
        makeTString({ masterId: 1, languageId: 2 })
      ];

      const state = tStringSlice.reducer(
        initialState,
        tStringSlice.actions.add(strings)
      );

      expect(state).toHaveLength(3);
    });

    it("keeps strings with different lessonStringIds as separate entries", () => {
      const str1 = makeTString({ masterId: 1, languageId: 1, lessonStringId: 10 });
      const str2 = makeTString({ masterId: 1, languageId: 1, lessonStringId: 20 });

      const state = tStringSlice.reducer(
        initialState,
        tStringSlice.actions.add([str1, str2])
      );

      expect(state).toHaveLength(2);
    });
  });
});

describe("tStringSlice thunks", () => {
  describe("loadTStrings", () => {
    it("calls GET for all tStrings in a language when no lessonId", async () => {
      const strings = [makeTString({ languageId: 5 })];
      const get = jest.fn().mockResolvedValue(strings);
      const dispatch = jest.fn();

      await loadTStrings(5)(get)(dispatch);

      expect(get).toHaveBeenCalledWith(
        "/api/languages/:languageId/tStrings",
        { languageId: 5 }
      );
      expect(dispatch).toHaveBeenCalledWith(tStringSlice.actions.add(strings));
    });

    it("calls GET for lesson-specific tStrings when lessonId is provided", async () => {
      const strings = [makeTString({ languageId: 5 })];
      const get = jest.fn().mockResolvedValue(strings);
      const dispatch = jest.fn();

      await loadTStrings(5, 10)(get)(dispatch);

      expect(get).toHaveBeenCalledWith(
        "/api/languages/:languageId/lessons/:lessonId/tStrings",
        { languageId: 5, lessonId: 10 }
      );
      expect(dispatch).toHaveBeenCalledWith(tStringSlice.actions.add(strings));
    });

    it("does not dispatch if GET returns null", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await loadTStrings(5)(get)(dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("pushTStrings", () => {
    it("posts tStrings and dispatches add with saved strings", async () => {
      const lang = makeLanguage({ languageId: 1, code: "en" });
      const tStrings = [makeTString({ masterId: 1, languageId: 1 })];
      const saved = [makeTString({ masterId: 1, languageId: 1, text: "Saved" })];
      const post = jest.fn().mockResolvedValue(saved);
      const dispatch = jest.fn();

      const result = await pushTStrings(tStrings, lang)(post, dispatch);

      expect(post).toHaveBeenCalledWith(
        "/api/tStrings",
        {},
        { tStrings, code: "en" }
      );
      expect(dispatch).toHaveBeenCalledWith(tStringSlice.actions.add(saved));
      expect(result).toEqual(saved);
    });

    it("does not dispatch if post returns null", async () => {
      const lang = makeLanguage();
      const tStrings = [makeTString()];
      const post = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      const result = await pushTStrings(tStrings, lang)(post, dispatch);

      expect(dispatch).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});
