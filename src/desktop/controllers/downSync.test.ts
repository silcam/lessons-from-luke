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

  test("fetches previews for multiple lessons, skipping those with existing previews", async () => {
    const app = makeApp();
    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 },
      { lessonId: 2, book: "Luke", series: 1, lesson: 2, version: 1 }
    ]);
    app.localStorage.getDocPreview
      .mockReturnValueOnce("<html>existing</html>") // lesson 1 has preview
      .mockReturnValueOnce("");                      // lesson 2 does not
    app.webClient.get.mockResolvedValue({ html: "<html>new preview</html>" });

    await fetchMissingPreviews(app);

    expect(app.webClient.get).toHaveBeenCalledTimes(1);
    expect(app.localStorage.setDocPreview).toHaveBeenCalledWith(2, "<html>new preview</html>");
  });
});

describe("downSync - TString batching", () => {
  test("fetches tStrings in T_STRING_BATCH_SIZE batches (1000 per batch)", async () => {
    const { T_STRING_BATCH_SIZE } = require("../../core/models/SyncState");
    const tStringIds = Array.from({ length: T_STRING_BATCH_SIZE + 5 }, (_, i) => i + 1);

    // Start with empty tStrings in state so the merge doesn't double the count
    const state = makeSyncState({
      downSync: makeDownSync({ tStrings: {}, timestamp: 5 }),
      syncLanguages: [{ languageId: 3, timestamp: 1 }],
      // No language set so fetchMissingSrcStrings short-circuits early (language == null)
      language: null
    });
    const app = makeApp(state);

    // Server returns 1005 new tString IDs for language 3
    // downSyncTStrings merges them into state.downSync.tStrings then calls syncTStrings
    const newDownSyncPackage = {
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: { 3: tStringIds },
      timestamp: 5,
      progress: 100
    };
    app.webClient.get
      .mockResolvedValueOnce(newDownSyncPackage) // initial downSync fetch in downSyncTStrings
      .mockResolvedValue([]); // tStrings batch fetch calls

    await downSyncTStrings(app);

    // Should have fetched in 2 batches (one of 1000, one of 5)
    const tStringGetCalls = app.webClient.get.mock.calls.filter(
      (call: any[]) => String(call[0]).includes("tStrings")
    );
    expect(tStringGetCalls.length).toBe(2);
  });
});

describe("downSync - lesson string sync", () => {
  test("syncs lesson strings and doc preview for each pending lesson", async () => {
    const lessonId = 7;
    const lessonData = {
      lessonId,
      book: "Luke",
      series: 1,
      lesson: 1,
      version: 1,
      lessonStrings: [
        { lessonStringId: 1, masterId: 100, lessonId, lessonVersion: 1, type: "content", xpath: "/root", motherTongue: false }
      ]
    };
    const syncState = makeSyncState({
      downSync: makeDownSync({ lessons: [lessonId], timestamp: 10 }),
      syncLanguages: []
    });
    const app = makeApp(syncState);

    // getDownSync will see progress=undefined (falsy) → fetch new downSync
    const newDownSync = { languages: false, baseLessons: false, lessons: [lessonId], tStrings: {}, timestamp: 10, progress: 50 };
    app.webClient.get
      .mockResolvedValueOnce(newDownSync)      // getDownSync
      .mockResolvedValueOnce(lessonData)       // syncLessons: fetch lesson
      .mockResolvedValueOnce({ html: "<html>preview</html>" }); // fetchDocPreview

    await downSync(app);

    expect(app.localStorage.setLessonStrings).toHaveBeenCalledWith(lessonId, lessonData.lessonStrings);
    expect(app.localStorage.setDocPreview).toHaveBeenCalledWith(lessonId, "<html>preview</html>");
    expect(app.localStorage.recalcProgress).toHaveBeenCalled();
  });
});

describe("downSyncTStrings", () => {
  test("merges tStrings from server into existing downSync tStrings state", async () => {
    const syncState = makeSyncState({
      downSync: makeDownSync({
        tStrings: { 3: [1, 2] },
        timestamp: 5
      }),
      syncLanguages: [{ languageId: 3, timestamp: 1 }],
      language: { languageId: 10, name: "Batanga", code: "btg", motherTongue: false, progress: [], defaultSrcLang: 1 }
    });
    const app = makeApp(syncState);

    const newDownSyncPackage = {
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: { 3: [3, 4] }, // server returns additional IDs
      timestamp: 5
    };
    app.webClient.get
      .mockResolvedValueOnce(newDownSyncPackage)
      .mockResolvedValue([]); // tStrings fetch

    await downSyncTStrings(app);

    // setSyncState should have been called to merge tStrings
    expect(app.localStorage.setSyncState).toHaveBeenCalled();
  });

  test("handles NO_CONNECTION gracefully during downSyncTStrings", async () => {
    const syncState = makeSyncState({
      syncLanguages: [{ languageId: 3, timestamp: 1 }]
    });
    const app = makeApp(syncState);
    app.webClient.get.mockResolvedValue(null); // null → NO_CONNECTION

    await expect(downSyncTStrings(app)).resolves.toBeUndefined();
  });
});

describe("downSync - getDownSync skips fetch when progress is between 1-99 (line 76)", () => {
  test("skips getDownSync fetch when progress is 50 (sync in progress)", async () => {
    const syncState = makeSyncState({
      downSync: makeDownSync({ progress: 50, languages: false, baseLessons: false, tStrings: {}, timestamp: 5 })
    });
    const app = makeApp(syncState);

    await downSync(app);

    // No fetch should have occurred since progress is between 1-99
    expect(app.webClient.get).not.toHaveBeenCalled();
  });
});

describe("downSync - fetchDocPreview handles 404 gracefully (line 226)", () => {
  test("fetchDocPreview swallows 404 errors and does not rethrow (line 226)", async () => {
    const lessonId = 10;
    const syncState = makeSyncState({
      downSync: makeDownSync({ lessons: [lessonId], timestamp: 4 }),
      syncLanguages: []
    });
    const app = makeApp(syncState);

    const newDownSync = { languages: false, baseLessons: false, lessons: [lessonId], tStrings: {}, timestamp: 4, progress: 50 };
    const lessonData = {
      lessonId,
      book: "Luke",
      series: 1,
      lesson: 1,
      version: 1,
      lessonStrings: []
    };
    // Fetch lesson succeeds, but doc preview returns 404
    const notFoundError = { status: 404, message: "Not Found" };
    app.webClient.get
      .mockResolvedValueOnce(newDownSync)     // getDownSync
      .mockResolvedValueOnce(lessonData)      // syncLessons: fetch lesson
      .mockRejectedValueOnce(notFoundError);  // fetchDocPreview: 404

    // Should not throw - 404 is swallowed
    await expect(downSync(app)).resolves.toBeUndefined();
  });
});

describe("downSync - syncLanguages timestamps (line 92)", () => {
  test("updates language timestamps when syncLanguages is non-empty", async () => {
    const syncState = makeSyncState({
      downSync: makeDownSync({ timestamp: 7 }),
      syncLanguages: [
        { languageId: 1, timestamp: 1 },
        { languageId: 2, timestamp: 2 }
      ]
    });
    const app = makeApp(syncState);

    // Return a valid downSync package so getDownSync runs through lines 83-96
    app.webClient.get.mockResolvedValueOnce({
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: {},
      timestamp: 7
    });

    await downSync(app);

    // setSyncState should have been called twice in getDownSync
    // (once for downSync, once for updateLanguageTimestamps)
    expect(app.localStorage.setSyncState).toHaveBeenCalledTimes(2);
  });
});

describe("downSync - fetchMissingSrcStrings (lines 188-202)", () => {
  test("fetches missing src strings when lessons have lessonStrings not in srcStrings (lines 188-202)", async () => {
    const language = {
      languageId: 10,
      name: "Batanga",
      code: "btg",
      motherTongue: false,
      progress: [],
      defaultSrcLang: 1
    };
    const syncState = makeSyncState({
      downSync: makeDownSync({ tStrings: { 10: [999] }, timestamp: 5 }),
      syncLanguages: [{ languageId: 10, timestamp: 1 }],
      language
    });
    const app = makeApp(syncState);

    // getLessons returns a lesson
    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }
    ]);
    // getLessonStrings returns a string with masterId 99
    app.localStorage.getLessonStrings.mockReturnValue([
      { lessonStringId: 1, masterId: 99, lessonId: 1, lessonVersion: 1, type: "content", xpath: "/root", motherTongue: false }
    ]);
    // getAllTStrings returns nothing (so masterId 99 is "missing")
    app.localStorage.getAllTStrings.mockReturnValue([]);

    // The first GET call (from downSyncTStrings) returns tStrings package
    const newDownSyncPackage = {
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: { 10: [999] },
      timestamp: 5
    };
    app.webClient.get
      .mockResolvedValueOnce(newDownSyncPackage) // downSyncTStrings initial fetch
      .mockResolvedValueOnce([])                 // syncTStrings batch fetch for language 10
      .mockResolvedValueOnce([{ masterId: 99, languageId: 1, text: "Hello", history: [] }]); // fetchMissingSrcStrings

    await downSyncTStrings(app);

    // fetchMissingSrcStrings should have called setTStrings for the src language
    const setTStringsCalls = app.localStorage.setTStrings.mock.calls;
    expect(setTStringsCalls.some((call: any[]) => call[0] === 1)).toBe(true);
  });

  test("does not fetch if no missing src strings (missingIds.length == 0, exits at line 194)", async () => {
    const language = {
      languageId: 10,
      name: "Batanga",
      code: "btg",
      motherTongue: false,
      progress: [],
      defaultSrcLang: 1
    };
    const syncState = makeSyncState({
      downSync: makeDownSync({ tStrings: { 10: [1] }, timestamp: 5 }),
      syncLanguages: [{ languageId: 10, timestamp: 1 }],
      language
    });
    const app = makeApp(syncState);

    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 1, book: "Luke", series: 1, lesson: 1, version: 1 }
    ]);
    app.localStorage.getLessonStrings.mockReturnValue([
      { lessonStringId: 1, masterId: 50, lessonId: 1, lessonVersion: 1, type: "content", xpath: "/root", motherTongue: false }
    ]);
    // getAllTStrings returns the string — so no missing ids
    app.localStorage.getAllTStrings.mockReturnValue([
      { masterId: 50, languageId: 1, text: "Exists", history: [] }
    ]);

    const newDownSyncPackage = {
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: { 10: [1] },
      timestamp: 5
    };
    app.webClient.get
      .mockResolvedValueOnce(newDownSyncPackage)
      .mockResolvedValue([]); // batch fetches

    await downSyncTStrings(app);

    // setTStrings for src lang 1 should NOT have been called (no missing ids)
    const setTStringsCalls = app.localStorage.setTStrings.mock.calls;
    const srcLangCalls = setTStringsCalls.filter((call: any[]) => call[0] === 1);
    expect(srcLangCalls.length).toBe(0);
  });
});

describe("catchSyncError - rethrows unknown errors (line 265)", () => {
  test("downSync rethrows non-sync errors through catchSyncError (line 265)", async () => {
    const app = makeApp();
    // Make the webClient.get throw an unexpected error
    const unexpectedError = new Error("Unexpected database error");
    app.webClient.get.mockRejectedValueOnce(unexpectedError);

    await expect(downSync(app)).rejects.toThrow("Unexpected database error");
  });

  test("fetchMissingPreviews rethrows non-sync errors through catchSyncError (line 265)", async () => {
    const app = makeApp();
    app.localStorage.getLessons.mockReturnValue([
      { lessonId: 5, book: "Luke", series: 1, lesson: 1, version: 1 }
    ]);
    app.localStorage.getDocPreview.mockReturnValue(""); // no existing preview
    // fetchDocPreview will call throwsNoConnection which throws when null
    // but we need a non-null result that causes an unexpected error
    // Actually fetchDocPreview catches 404 errors but rethrows others
    app.webClient.get.mockRejectedValueOnce(new Error("Network timeout"));

    await expect(fetchMissingPreviews(app)).rejects.toThrow("Network timeout");
  });
});

describe("downSync - EXPIRED_SYNC", () => {
  test("catches EXPIRED_SYNC without rethrowing", async () => {
    // This happens when timestamp changes mid-sync
    const syncState = makeSyncState({
      downSync: makeDownSync({ baseLessons: true, timestamp: 5 })
    });
    const app = makeApp(syncState);

    // First get returns a different timestamp → causes EXPIRED_SYNC on updateDownSync
    app.webClient.get
      .mockResolvedValueOnce({ languages: false, baseLessons: true, lessons: [], tStrings: {}, timestamp: 5 })
      .mockImplementation(() => {
        // After baseLessons sync, change the timestamp so updateDownSync throws EXPIRED_SYNC
        app.localStorage.getSyncState.mockReturnValue({
          ...makeSyncState({ downSync: makeDownSync({ timestamp: 999 }) })
        });
        return Promise.resolve([]);
      });

    // Should not throw - EXPIRED_SYNC is caught
    await expect(downSync(app)).resolves.toBeUndefined();
  });
});
