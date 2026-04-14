/// <reference types="jest" />

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-data"),
    isPackaged: false
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    removeHandler: jest.fn()
  }
}));

const registeredHandlers: { [route: string]: Function } = {};

jest.mock("../DesktopAPIServer", () => ({
  addGetHandler: jest.fn((route: string, handler: Function) => {
    registeredHandlers[route] = handler;
  }),
  addPostHandler: jest.fn((route: string, handler: Function) => {
    registeredHandlers[route] = handler;
  })
}));

import languagesController from "./languagesController";
import { initalStoredSyncState, StoredSyncState } from "../../core/models/SyncState";
import { Language, PublicLanguage } from "../../core/models/Language";

function makePublicLanguage(overrides: Partial<PublicLanguage> = {}): PublicLanguage {
  return {
    languageId: 10,
    name: "Batanga",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
    ...overrides
  };
}

function makeLanguage(overrides: Partial<Language> = {}): Language {
  return {
    languageId: 10,
    name: "Batanga",
    code: "btg",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
    ...overrides
  };
}

function makeSyncState(overrides: Partial<StoredSyncState> = {}): StoredSyncState {
  return {
    ...initalStoredSyncState(),
    ...overrides
  };
}

function makeApp(syncStateOverrides: Partial<StoredSyncState> = {}) {
  const syncState = makeSyncState(syncStateOverrides);

  const localStorage = {
    getSyncState: jest.fn(() => syncState),
    getLanguages: jest.fn(() => [] as PublicLanguage[])
  };

  return { localStorage } as any;
}

describe("languagesController", () => {
  beforeEach(() => {
    Object.keys(registeredHandlers).forEach(k => delete registeredHandlers[k]);
    jest.clearAllMocks();
  });

  describe("/api/languages GET", () => {
    test("returns only languages that are in syncLanguages", async () => {
      const lang1 = makePublicLanguage({ languageId: 3, name: "French" });
      const lang2 = makePublicLanguage({ languageId: 5, name: "German" });
      const lang3 = makePublicLanguage({ languageId: 7, name: "Spanish" });

      const app = makeApp({
        syncLanguages: [{ languageId: 3, timestamp: 1 }, { languageId: 5, timestamp: 2 }]
      });
      app.localStorage.getLanguages.mockReturnValue([lang1, lang2, lang3]);
      languagesController(app);

      const result = await registeredHandlers["/api/languages"]();
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(lang1);
      expect(result).toContainEqual(lang2);
      expect(result).not.toContainEqual(lang3);
    });

    test("returns empty array when syncLanguages is empty", async () => {
      const app = makeApp({ syncLanguages: [] });
      app.localStorage.getLanguages.mockReturnValue([
        makePublicLanguage({ languageId: 3 })
      ]);
      languagesController(app);

      const result = await registeredHandlers["/api/languages"]();
      expect(result).toEqual([]);
    });

    test("returns empty array when no languages are stored", async () => {
      const app = makeApp({
        syncLanguages: [{ languageId: 3, timestamp: 1 }]
      });
      app.localStorage.getLanguages.mockReturnValue([]);
      languagesController(app);

      const result = await registeredHandlers["/api/languages"]();
      expect(result).toEqual([]);
    });

    test("returns all stored languages that appear in syncLanguages", async () => {
      const lang1 = makePublicLanguage({ languageId: 1, name: "English" });
      const lang2 = makePublicLanguage({ languageId: 10, name: "Batanga" });

      const app = makeApp({
        syncLanguages: [
          { languageId: 10, timestamp: 5 },
          { languageId: 1, timestamp: 5 }
        ]
      });
      app.localStorage.getLanguages.mockReturnValue([lang1, lang2]);
      languagesController(app);

      const result = await registeredHandlers["/api/languages"]();
      expect(result).toHaveLength(2);
    });
  });

  describe("/api/languages/code/:code GET", () => {
    test("returns the language when the code matches syncState.language.code", async () => {
      const language = makeLanguage({ code: "btg" });
      const app = makeApp({ language });
      languagesController(app);

      const result = await registeredHandlers["/api/languages/code/:code"]({ code: "btg" });
      expect(result).toEqual(language);
    });

    test("throws { status: 404 } when no language is set in syncState", async () => {
      const app = makeApp({ language: null });
      languagesController(app);

      await expect(
        registeredHandlers["/api/languages/code/:code"]({ code: "btg" })
      ).rejects.toEqual({ status: 404 });
    });

    test("throws { status: 404 } when code does not match syncState.language.code", async () => {
      const language = makeLanguage({ code: "btg" });
      const app = makeApp({ language });
      languagesController(app);

      await expect(
        registeredHandlers["/api/languages/code/:code"]({ code: "fra" })
      ).rejects.toEqual({ status: 404 });
    });

    test("throws { status: 404 } when code is empty string", async () => {
      const app = makeApp({ language: null });
      languagesController(app);

      await expect(
        registeredHandlers["/api/languages/code/:code"]({ code: "" })
      ).rejects.toEqual({ status: 404 });
    });
  });
});
