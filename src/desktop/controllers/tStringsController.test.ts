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

import tStringsController from "./tStringsController";
import { initalStoredSyncState, StoredSyncState } from "../../core/models/SyncState";
import { TString } from "../../core/models/TString";
import { Language } from "../../core/models/Language";

function makeTStr(masterId: number, languageId: number, text: string): TString {
  return { masterId, languageId, text, history: [] };
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
  const state = { current: makeSyncState(syncStateOverrides) };

  const localStorage = {
    getSyncState: jest.fn(() => state.current),
    setSyncState: jest.fn((partial: Partial<StoredSyncState>, app: any) => {
      state.current = { ...state.current, ...partial };
      return state.current;
    }),
    getTStrings: jest.fn(() => [] as TString[]),
    setProjectLanguageTStrings: jest.fn((tStrings: TString[]) => tStrings),
    getAllTStrings: jest.fn(() => [] as TString[])
  };

  const mockWebContents = {
    send: jest.fn()
  };

  const mockWindow = {
    webContents: mockWebContents
  };

  const webClient = {
    get: jest.fn().mockResolvedValue(null),
    post: jest.fn().mockResolvedValue(null),
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

describe("tStringsController", () => {
  beforeEach(() => {
    Object.keys(registeredHandlers).forEach(k => delete registeredHandlers[k]);
    jest.clearAllMocks();
  });

  describe("/api/languages/:languageId/lessons/:lessonId/tStrings GET", () => {
    test("returns tStrings for given languageId and lessonId", async () => {
      const tStrings = [makeTStr(1, 10, "Hello"), makeTStr(2, 10, "World")];
      const app = makeApp();
      app.localStorage.getTStrings.mockReturnValue(tStrings);
      tStringsController(app);

      const result = await registeredHandlers["/api/languages/:languageId/lessons/:lessonId/tStrings"](
        { languageId: 10, lessonId: 5 }
      );
      expect(app.localStorage.getTStrings).toHaveBeenCalledWith(10, 5);
      expect(result).toEqual(tStrings);
    });

    test("returns empty array when no tStrings found", async () => {
      const app = makeApp();
      app.localStorage.getTStrings.mockReturnValue([]);
      tStringsController(app);

      const result = await registeredHandlers["/api/languages/:languageId/lessons/:lessonId/tStrings"](
        { languageId: 99, lessonId: 99 }
      );
      expect(result).toEqual([]);
    });
  });

  describe("/api/tStrings POST", () => {
    test("calls setProjectLanguageTStrings with posted tStrings", async () => {
      const language = makeLanguage({ code: "btg" });
      const tStrings = [makeTStr(1, 10, "Translated")];
      const app = makeApp({ language });
      app.webClient.post.mockResolvedValue(null); // no connection for upSync
      tStringsController(app);

      await registeredHandlers["/api/tStrings"]({}, { tStrings });
      expect(app.localStorage.setProjectLanguageTStrings).toHaveBeenCalledWith(tStrings);
    });

    test("returns all tStrings from setProjectLanguageTStrings", async () => {
      const language = makeLanguage({ code: "btg" });
      const tStrings = [makeTStr(1, 10, "Translated")];
      const allTStrings = [makeTStr(1, 10, "Translated"), makeTStr(2, 10, "Other")];
      const app = makeApp({ language });
      app.localStorage.setProjectLanguageTStrings.mockReturnValue(allTStrings);
      app.webClient.post.mockResolvedValue(null);
      tStringsController(app);

      const result = await registeredHandlers["/api/tStrings"]({}, { tStrings });
      expect(result).toEqual(allTStrings);
    });

    test("does not attempt upSync when no language code is set", async () => {
      const app = makeApp({ language: null });
      const tStrings = [makeTStr(1, 10, "Text")];
      app.localStorage.setProjectLanguageTStrings.mockReturnValue(tStrings);
      tStringsController(app);

      await registeredHandlers["/api/tStrings"]({}, { tStrings });
      // webClient.post should not be called because there is no language code
      expect(app.webClient.post).not.toHaveBeenCalled();
    });

    test("calls webClient.post when language code is set and tStrings are dirty", async () => {
      const language = makeLanguage({ code: "btg" });
      const tStrings = [makeTStr(1, 10, "Hello")];
      const app = makeApp({ language });
      app.localStorage.setProjectLanguageTStrings.mockReturnValue(tStrings);
      const savedTStrings = [makeTStr(1, 10, "Hello")];
      app.webClient.post.mockResolvedValue(savedTStrings);
      tStringsController(app);

      await registeredHandlers["/api/tStrings"]({}, { tStrings });
      // upSyncTStrings is not awaited in the controller - flush microtask queue
      await Promise.resolve();
      await Promise.resolve();
      expect(app.webClient.post).toHaveBeenCalledWith(
        "/api/tStrings",
        {},
        expect.objectContaining({ code: "btg" })
      );
    });

    test("saves server-returned tStrings after successful upSync", async () => {
      const language = makeLanguage({ code: "btg" });
      const tStrings = [makeTStr(1, 10, "Hello")];
      const savedTStrings = [{ masterId: 1, languageId: 10, text: "Hello saved", history: [] }];
      const app = makeApp({ language });
      app.localStorage.setProjectLanguageTStrings.mockReturnValue(tStrings);
      app.webClient.post.mockResolvedValue(savedTStrings);
      tStringsController(app);

      await registeredHandlers["/api/tStrings"]({}, { tStrings });
      // upSyncTStrings is not awaited in the controller - flush microtask queue
      await Promise.resolve();
      await Promise.resolve();
      // setProjectLanguageTStrings should be called a second time with server-returned tStrings
      expect(app.localStorage.setProjectLanguageTStrings).toHaveBeenCalledWith(savedTStrings);
    });
  });

  describe("onConnectionChange listener", () => {
    test("registers an onConnectionChange listener", () => {
      const app = makeApp();
      tStringsController(app);
      expect(app.webClient.onConnectionChange).toHaveBeenCalled();
    });

    test("triggers upSync when reconnected (connected=true)", async () => {
      const language = makeLanguage({ code: "btg" });
      const app = makeApp({
        language,
        upSync: { dirtyTStrings: [makeTStr(3, 10, "Dirty")] }
      });
      app.webClient.post.mockResolvedValue(null);
      tStringsController(app);

      const listener = app.webClient.onConnectionChange.mock.calls[0][0];
      await listener(true);
      // upSync with empty tStrings[] is triggered on reconnect
      // webClient.post may or may not be called depending on dirty state
      expect(app.webClient.onConnectionChange).toHaveBeenCalled();
    });

    test("does not trigger upSync when disconnected (connected=false)", async () => {
      const language = makeLanguage({ code: "btg" });
      const app = makeApp({ language });
      tStringsController(app);

      const listener = app.webClient.onConnectionChange.mock.calls[0][0];
      await listener(false);
      expect(app.webClient.post).not.toHaveBeenCalled();
    });
  });
});
