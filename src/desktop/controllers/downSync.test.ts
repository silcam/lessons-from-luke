/// <reference types="jest" />

jest.mock("../DesktopApp", () => ({
  default: class MockDesktopApp {}
}));

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-data"),
    isPackaged: false
  }
}));

import {
  downSync,
  downSyncTStrings,
  fetchMissingPreviews,
  NO_CONNECTION,
  EXPIRED_SYNC
} from "./downSync";
import {
  initalStoredSyncState,
  StoredSyncState,
  ContinuousSyncPackage
} from "../../core/models/SyncState";

function makeDownSync(overrides: Partial<ContinuousSyncPackage> = {}): ContinuousSyncPackage {
  return {
    languages: false,
    baseLessons: false,
    lessons: [],
    tStrings: {},
    timestamp: 1,
    ...overrides
  };
}

function makeSyncState(overrides: Partial<StoredSyncState> = {}): StoredSyncState {
  return {
    ...initalStoredSyncState(),
    ...overrides
  };
}

function makeApp(syncState: StoredSyncState = makeSyncState(), webGetImpl?: jest.Mock) {
  const state = { current: syncState };

  const mockGet = webGetImpl || jest.fn().mockResolvedValue(null);

  const localStorage = {
    getSyncState: jest.fn(() => state.current),
    setSyncState: jest.fn((partial: Partial<StoredSyncState>) => {
      state.current = { ...state.current, ...partial };
      return state.current;
    }),
    setLanguages: jest.fn(),
    setLessons: jest.fn(),
    setLessonStrings: jest.fn(),
    setTStrings: jest.fn(),
    removeDocPreview: jest.fn(),
    setDocPreview: jest.fn(),
    getDocPreview: jest.fn(() => ""),
    getLessons: jest.fn(() => []),
    getLessonStrings: jest.fn(() => []),
    getAllTStrings: jest.fn(() => []),
    getLessonCount: jest.fn(() => 0),
    getTStringCount: jest.fn(() => 0),
    recalcProgress: jest.fn()
  };

  const webClient = {
    get: mockGet
  };

  return { localStorage, webClient } as any;
}

describe("downSync", () => {
  test("does nothing and does not throw when webClient returns null (no connection)", async () => {
    const app = makeApp();
    app.webClient.get.mockResolvedValue(null);
    await expect(downSync(app)).resolves.toBeUndefined();
  });

  test("syncs languages when downSync.languages is true", async () => {
    const syncState = makeSyncState({
      downSync: makeDownSync({ languages: true, timestamp: 5 })
    });
    const app = makeApp(syncState);
    const languages = [{ languageId: 3, name: "French", motherTongue: false, defaultSrcLang: 1, progress: [] }];

    app.webClient.get
      .mockResolvedValueOnce({ languages: true, baseLessons: false, lessons: [], tStrings: {}, timestamp: 5 })
      .mockResolvedValueOnce(languages);

    await downSync(app);

    expect(app.localStorage.setLanguages).toHaveBeenCalledWith(languages);
  });

  test("syncs base lessons when downSync.baseLessons is true", async () => {
    const syncState = makeSyncState({
      downSync: makeDownSync({ baseLessons: true, timestamp: 3 })
    });
    const app = makeApp(syncState);
    const lessons = [{ lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }];

    app.webClient.get
      .mockResolvedValueOnce({ languages: false, baseLessons: true, lessons: [], tStrings: {}, timestamp: 3 })
      .mockResolvedValueOnce(lessons);

    await downSync(app);

    expect(app.localStorage.setLessons).toHaveBeenCalledWith(lessons);
  });

  test("catches NO_CONNECTION without rethrowing", async () => {
    const app = makeApp();
    app.webClient.get.mockResolvedValue(null); // returns null → throws NO_CONNECTION
    await expect(downSync(app)).resolves.toBeUndefined();
  });
});

describe("fetchMissingPreviews", () => {
  test("does not throw when no lessons are stored", async () => {
    const app = makeApp();
    app.localStorage.getLessons.mockReturnValue([]);
    await expect(fetchMissingPreviews(app)).resolves.toBeUndefined();
  });

  test("skips lessons that already have a preview", async () => {
    const app = makeApp();
    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }
    ]);
    app.localStorage.getDocPreview.mockReturnValue("<html>existing</html>");

    await fetchMissingPreviews(app);

    // webClient.get should not be called for lessons that already have previews
    expect(app.webClient.get).not.toHaveBeenCalled();
  });

  test("fetches preview for lesson without one", async () => {
    const app = makeApp();
    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 5, book: "Luke", series: 1, lesson: 1, version: 1 }
    ]);
    app.localStorage.getDocPreview.mockReturnValue("");
    app.webClient.get.mockResolvedValue({ html: "<html>preview</html>" });

    await fetchMissingPreviews(app);

    expect(app.localStorage.setDocPreview).toHaveBeenCalledWith(5, "<html>preview</html>");
  });

  test("handles no-connection gracefully when fetching previews", async () => {
    const app = makeApp();
    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 5, book: "Luke", series: 1, lesson: 1, version: 1 }
    ]);
    app.localStorage.getDocPreview.mockReturnValue("");
    app.webClient.get.mockResolvedValue(null);

    await expect(fetchMissingPreviews(app)).resolves.toBeUndefined();
  });
});
