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

// We mock DesktopAPIServer so we can intercept addGetHandler / addPostHandler
// and directly invoke the handlers in tests.
const registeredHandlers: { [route: string]: Function } = {};

jest.mock("../DesktopAPIServer", () => ({
  addGetHandler: jest.fn((route: string, handler: Function) => {
    registeredHandlers[route] = handler;
  }),
  addPostHandler: jest.fn((route: string, handler: Function) => {
    registeredHandlers[route] = handler;
  })
}));

// Mock downSyncTStrings so it doesn't actually do anything
jest.mock("./downSync", () => ({
  downSyncTStrings: jest.fn()
}));

import syncStateController from "./syncStateController";
import { downSyncTStrings } from "./downSync";
import { initalStoredSyncState, StoredSyncState } from "../../core/models/SyncState";
import { Language } from "../../core/models/Language";

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
  const state = { current: makeSyncState(syncStateOverrides) };

  const localStorage = {
    getSyncState: jest.fn(() => state.current),
    setSyncState: jest.fn((partial: Partial<StoredSyncState>) => {
      state.current = { ...state.current, ...partial };
      return state.current;
    }),
    getLessons: jest.fn(() => []),
    getLessonStrings: jest.fn(() => []),
    getTStrings: jest.fn(() => [])
  };

  const mockWebContents = {
    send: jest.fn()
  };

  const mockWindow = {
    webContents: mockWebContents
  };

  const webClient = {
    get: jest.fn().mockResolvedValue(null),
    isConnected: jest.fn(() => false),
    onConnectionChange: jest.fn()
  };

  const app = {
    localStorage,
    webClient,
    getWindow: jest.fn(() => mockWindow)
  };

  return app as any;
}

describe("syncStateController", () => {
  beforeEach(() => {
    // Clear all registered handlers before each test
    Object.keys(registeredHandlers).forEach(k => delete registeredHandlers[k]);
    jest.clearAllMocks();
  });

  describe("/api/syncState GET", () => {
    test("returns syncState merged with connected and loaded=true", async () => {
      const app = makeApp();
      app.webClient.isConnected.mockReturnValue(true);
      syncStateController(app);

      const result = await registeredHandlers["/api/syncState"]();
      expect(result).toMatchObject({
        loaded: true,
        connected: true
      });
    });

    test("connected is false when webClient.isConnected returns false", async () => {
      const app = makeApp();
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      const result = await registeredHandlers["/api/syncState"]();
      expect(result.connected).toBe(false);
      expect(result.loaded).toBe(true);
    });

    test("includes language from syncState", async () => {
      const language = makeLanguage();
      const app = makeApp({ language });
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      const result = await registeredHandlers["/api/syncState"]();
      expect(result.language).toEqual(language);
    });
  });

  describe("/api/readyToTranslate GET", () => {
    test("returns { readyToTranslate: false } when no language set", async () => {
      const app = makeApp({ language: null });
      syncStateController(app);

      const result = await registeredHandlers["/api/readyToTranslate"]();
      expect(result).toEqual({ readyToTranslate: false });
    });

    test("returns { readyToTranslate: false } when language set but no lessons", async () => {
      const language = makeLanguage();
      const app = makeApp({ language });
      app.localStorage.getLessons.mockReturnValue([]);
      syncStateController(app);

      const result = await registeredHandlers["/api/readyToTranslate"]();
      expect(result).toEqual({ readyToTranslate: false });
    });

    test("returns { readyToTranslate: false } when lessons exist but no lessonStrings", async () => {
      const language = makeLanguage();
      const app = makeApp({ language });
      app.localStorage.getLessons.mockReturnValue([
        { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }
      ]);
      app.localStorage.getLessonStrings.mockReturnValue([]);
      syncStateController(app);

      const result = await registeredHandlers["/api/readyToTranslate"]();
      expect(result).toEqual({ readyToTranslate: false });
    });

    test("returns { readyToTranslate: true } when all lesson strings have matching src tStrings", async () => {
      const language = makeLanguage({ defaultSrcLang: 1 });
      const app = makeApp({ language });
      app.localStorage.getLessons.mockReturnValue([
        { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }
      ]);
      app.localStorage.getLessonStrings.mockReturnValue([
        { lessonStringId: 1, masterId: 100, lessonId: 1, lessonVersion: 1, type: "content", xpath: "/root", motherTongue: false }
      ]);
      app.localStorage.getTStrings.mockReturnValue([
        { masterId: 100, languageId: 1, text: "Hello", history: [] }
      ]);
      syncStateController(app);

      const result = await registeredHandlers["/api/readyToTranslate"]();
      expect(result).toEqual({ readyToTranslate: true });
    });

    test("returns { readyToTranslate: false } when some lesson strings are missing src tStrings", async () => {
      const language = makeLanguage({ defaultSrcLang: 1 });
      const app = makeApp({ language });
      app.localStorage.getLessons.mockReturnValue([
        { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }
      ]);
      app.localStorage.getLessonStrings.mockReturnValue([
        { lessonStringId: 1, masterId: 100, lessonId: 1, lessonVersion: 1, type: "content", xpath: "/root", motherTongue: false },
        { lessonStringId: 2, masterId: 101, lessonId: 1, lessonVersion: 1, type: "content", xpath: "/root2", motherTongue: false }
      ]);
      // Only one of two tStrings is available
      app.localStorage.getTStrings.mockReturnValue([
        { masterId: 100, languageId: 1, text: "Hello", history: [] }
      ]);
      syncStateController(app);

      const result = await registeredHandlers["/api/readyToTranslate"]();
      expect(result).toEqual({ readyToTranslate: false });
    });
  });

  describe("/api/syncState/code POST", () => {
    test("calls downSyncTStrings when language is found", async () => {
      const language = makeLanguage({ code: "btg" });
      const app = makeApp();
      app.webClient.get.mockResolvedValue(language);
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      await registeredHandlers["/api/syncState/code"]({}, { code: "btg" });
      expect(downSyncTStrings).toHaveBeenCalledWith(app);
    });

    test("sets syncState with language and syncLanguages when language is found", async () => {
      const language = makeLanguage({ code: "btg", languageId: 10, defaultSrcLang: 1 });
      const app = makeApp();
      app.webClient.get.mockResolvedValue(language);
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      await registeredHandlers["/api/syncState/code"]({}, { code: "btg" });
      expect(app.localStorage.setSyncState).toHaveBeenCalledWith(
        expect.objectContaining({
          language,
          syncLanguages: expect.arrayContaining([
            { languageId: 10, timestamp: 1 },
            { languageId: 1, timestamp: 1 }
          ])
        }),
        null
      );
    });

    test("does not set syncState when language is not found (webClient returns null)", async () => {
      const app = makeApp();
      app.webClient.get.mockResolvedValue(null);
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      await registeredHandlers["/api/syncState/code"]({}, { code: "unknown" });
      // setSyncState should not be called for the language update
      expect(app.localStorage.setSyncState).not.toHaveBeenCalled();
    });

    test("returns full sync state", async () => {
      const language = makeLanguage({ code: "btg" });
      const app = makeApp();
      app.webClient.get.mockResolvedValue(language);
      app.webClient.isConnected.mockReturnValue(true);
      syncStateController(app);

      const result = await registeredHandlers["/api/syncState/code"]({}, { code: "btg" });
      expect(result).toMatchObject({ loaded: true, connected: true });
    });
  });

  describe("/api/syncState/locale POST", () => {
    test("sets locale in syncState", async () => {
      const app = makeApp();
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      await registeredHandlers["/api/syncState/locale"]({}, { locale: "fr" });
      expect(app.localStorage.setSyncState).toHaveBeenCalledWith({ locale: "fr" }, null);
    });

    test("returns full sync state with new locale", async () => {
      const app = makeApp();
      app.webClient.isConnected.mockReturnValue(false);
      syncStateController(app);

      const result = await registeredHandlers["/api/syncState/locale"]({}, { locale: "fr" });
      expect(result).toMatchObject({ loaded: true });
    });
  });

  describe("/api/syncState/progress POST", () => {
    test("does nothing if no language is set", async () => {
      const app = makeApp({ language: null });
      syncStateController(app);

      const result = await registeredHandlers["/api/syncState/progress"]({}, { lessonId: 1, progress: 50 });
      expect(result).toBeUndefined();
      expect(app.localStorage.setSyncState).not.toHaveBeenCalled();
    });

    test("updates progress for a lesson, replacing old entry", async () => {
      const language = makeLanguage({
        progress: [
          { lessonId: 1, progress: 30 },
          { lessonId: 2, progress: 60 }
        ]
      });
      const app = makeApp({ language });
      syncStateController(app);

      await registeredHandlers["/api/syncState/progress"]({}, { lessonId: 1, progress: 80 });
      expect(app.localStorage.setSyncState).toHaveBeenCalledWith(
        expect.objectContaining({
          language: expect.objectContaining({
            progress: expect.arrayContaining([
              { lessonId: 1, progress: 80 },
              { lessonId: 2, progress: 60 }
            ])
          })
        }),
        null
      );
      const call = (app.localStorage.setSyncState as jest.Mock).mock.calls[0][0];
      const updatedProgress = call.language.progress;
      expect(updatedProgress.filter((p: any) => p.lessonId === 1)).toHaveLength(1);
      expect(updatedProgress.find((p: any) => p.lessonId === 1).progress).toBe(80);
    });

    test("adds progress entry for a new lesson", async () => {
      const language = makeLanguage({
        progress: [{ lessonId: 2, progress: 60 }]
      });
      const app = makeApp({ language });
      syncStateController(app);

      await registeredHandlers["/api/syncState/progress"]({}, { lessonId: 5, progress: 45 });
      const call = (app.localStorage.setSyncState as jest.Mock).mock.calls[0][0];
      const updatedProgress = call.language.progress;
      expect(updatedProgress).toHaveLength(2);
      expect(updatedProgress.find((p: any) => p.lessonId === 5).progress).toBe(45);
    });
  });

  describe("connection change listener", () => {
    test("registers onConnectionChange listener", () => {
      const app = makeApp();
      syncStateController(app);
      expect(app.webClient.onConnectionChange).toHaveBeenCalled();
    });

    test("sends ON_SYNC_STATE_CHANGE to window on connection change", () => {
      const app = makeApp();
      app.webClient.isConnected.mockReturnValue(true);
      syncStateController(app);

      // Simulate connection change
      const listener = app.webClient.onConnectionChange.mock.calls[0][0];
      listener(true);

      expect(app.getWindow().webContents.send).toHaveBeenCalledWith(
        "onSyncStateChange",
        expect.objectContaining({ loaded: true, connected: true })
      );
    });
  });
});
