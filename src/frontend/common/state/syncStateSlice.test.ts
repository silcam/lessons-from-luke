import syncStateSlice, { loadSyncState, pushCode, pushLocale } from "./syncStateSlice";
import { initalStoredSyncState, SyncState } from "../../../core/models/SyncState";
import languageSlice from "./languageSlice";
import { Language } from "../../../core/models/Language";

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

function makeInitialState(): SyncState {
  return {
    ...initalStoredSyncState(),
    connected: false,
    loaded: false
  };
}

describe("syncStateSlice reducers", () => {
  describe("setSyncState", () => {
    it("merges partial sync state into current state", () => {
      const initial = makeInitialState();

      const state = syncStateSlice.reducer(
        initial,
        syncStateSlice.actions.setSyncState({ connected: true, loaded: true })
      );

      expect(state.connected).toBe(true);
      expect(state.loaded).toBe(true);
    });

    it("preserves other fields when merging partial state", () => {
      const initial = makeInitialState();
      const lang = makeLanguage();

      const state = syncStateSlice.reducer(
        initial,
        syncStateSlice.actions.setSyncState({ language: lang })
      );

      expect(state.language).toEqual(lang);
      expect(state.connected).toBe(false);
      expect(state.loaded).toBe(false);
    });

    it("updates downSync when provided", () => {
      const initial = makeInitialState();
      const updatedDownSync = {
        languages: true,
        baseLessons: true,
        lessons: [1, 2],
        tStrings: {},
        timestamp: 42
      };

      const state = syncStateSlice.reducer(
        initial,
        syncStateSlice.actions.setSyncState({ downSync: updatedDownSync })
      );

      expect(state.downSync).toEqual(updatedDownSync);
    });
  });
});

describe("syncStateSlice thunks", () => {
  describe("loadSyncState", () => {
    it("calls GET /api/syncState and dispatches setSyncState", async () => {
      const syncState: SyncState = {
        ...initalStoredSyncState(),
        connected: true,
        loaded: true
      };
      const get = jest.fn().mockResolvedValue(syncState);
      const dispatch = jest.fn();

      const result = await loadSyncState()(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/syncState", {});
      expect(dispatch).toHaveBeenCalledWith(
        syncStateSlice.actions.setSyncState(syncState)
      );
      expect(result).toEqual(syncState);
    });

    it("dispatches setTranslating if syncState has a language", async () => {
      const lang = makeLanguage();
      const syncState: SyncState = {
        ...initalStoredSyncState(),
        language: lang,
        connected: true,
        loaded: true
      };
      const get = jest.fn().mockResolvedValue(syncState);
      const dispatch = jest.fn();

      await loadSyncState()(get)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(
        languageSlice.actions.setTranslating(lang)
      );
    });

    it("does not dispatch setTranslating if syncState has no language", async () => {
      const syncState: SyncState = {
        ...initalStoredSyncState(),
        language: null,
        connected: true,
        loaded: true
      };
      const get = jest.fn().mockResolvedValue(syncState);
      const dispatch = jest.fn();

      await loadSyncState()(get)(dispatch);

      // Only the setSyncState dispatch, not setTranslating
      const calls = dispatch.mock.calls;
      const hasSetTranslating = calls.some(
        ([action]) => action.type === "languages/setTranslating"
      );
      expect(hasSetTranslating).toBe(false);
    });

    it("does not dispatch and returns null if GET returns null", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      const result = await loadSyncState()(get)(dispatch);

      expect(dispatch).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe("pushCode", () => {
    it("posts code and dispatches setSyncState", async () => {
      const syncState: SyncState = {
        ...initalStoredSyncState(),
        connected: true,
        loaded: true
      };
      const post = jest.fn().mockResolvedValue(syncState);
      const dispatch = jest.fn();

      const result = await pushCode("ABC123")(post, dispatch);

      expect(post).toHaveBeenCalledWith("/api/syncState/code", {}, { code: "ABC123" });
      expect(dispatch).toHaveBeenCalledWith(
        syncStateSlice.actions.setSyncState(syncState)
      );
      expect(result).toEqual(syncState);
    });

    it("does not dispatch if post returns null", async () => {
      const post = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await pushCode("ABC123")(post, dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("pushLocale", () => {
    it("posts locale and dispatches setSyncState", async () => {
      const syncState: SyncState = {
        ...initalStoredSyncState(),
        locale: "fr",
        connected: true,
        loaded: true
      };
      const post = jest.fn().mockResolvedValue(syncState);
      const dispatch = jest.fn();

      await pushLocale("fr")(post, dispatch);

      expect(post).toHaveBeenCalledWith("/api/syncState/locale", {}, { locale: "fr" });
      expect(dispatch).toHaveBeenCalledWith(
        syncStateSlice.actions.setSyncState(syncState)
      );
    });

    it("does not dispatch if post returns null", async () => {
      const post = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await pushLocale("fr")(post, dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
