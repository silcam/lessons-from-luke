/// <reference types="jest" />

import {
  downSyncProgress,
  updateLanguageTimestamps,
  resync,
  initalStoredSyncState,
  StoredSyncState,
  ContinuousSyncPackage,
  T_STRING_BATCH_SIZE
} from "./SyncState";

const baseDownSync: ContinuousSyncPackage = {
  languages: false,
  baseLessons: false,
  lessons: [],
  tStrings: {},
  timestamp: 1
};

describe("downSyncProgress", () => {
  test("returns 0 when storedLessonCount is 0", () => {
    expect(downSyncProgress(baseDownSync, 0, 100)).toBe(0);
  });

  test("returns 0 when storedTStringCount and neededTStringCount are both 0", () => {
    expect(downSyncProgress(baseDownSync, 5, 0)).toBe(0);
  });

  test("returns 100 when nothing is pending", () => {
    // totalRequests = 2*2 + 2000/1000 = 4+2 = 6; neededRequests = 0
    expect(downSyncProgress(baseDownSync, 2, 2000)).toBe(100);
  });

  test("returns 100 when languages flag is set but no actual work pending", () => {
    const downSync: ContinuousSyncPackage = { ...baseDownSync, languages: true };
    expect(downSyncProgress(downSync, 2, 2000)).toBe(100);
  });

  test("returns less than 100 when lessons are pending", () => {
    const downSync: ContinuousSyncPackage = { ...baseDownSync, lessons: [1] };
    // totalRequests = 2*2 + 2000/1000 = 6; neededRequests = 1*2 = 2
    // progress = round(100 * 4/6) = round(66.67) = 67
    expect(downSyncProgress(downSync, 2, 2000)).toBe(67);
  });

  test("returns less than 100 when tStrings are pending", () => {
    const pending = Array.from({ length: T_STRING_BATCH_SIZE }, (_, i) => i + 1);
    const downSync: ContinuousSyncPackage = {
      ...baseDownSync,
      tStrings: { 3: pending }
    };
    // neededTStringCount = 1000
    // totalRequests = 2*2 + (2000+1000)/1000 = 4+3 = 7
    // neededRequests = 0 + 1000/1000 = 1
    // progress = round(100 * 6/7) = round(85.71) = 86
    expect(downSyncProgress(downSync, 2, 2000)).toBe(86);
  });

  test("sums tString arrays across multiple languages", () => {
    const pending = Array.from({ length: T_STRING_BATCH_SIZE }, (_, i) => i + 1);
    const downSync: ContinuousSyncPackage = {
      ...baseDownSync,
      tStrings: { 3: pending, 4: pending }
    };
    // neededTStringCount = 2000
    // storedLessonCount=1, storedTStringCount=0 (but neededTStringCount=2000 so doesn't return 0)
    // totalRequests = 1*2 + (0+2000)/1000 = 4; neededRequests = 2000/1000 = 2
    // progress = round(100 * 2/4) = 50
    expect(downSyncProgress(downSync, 1, 0)).toBe(50);
  });
});

describe("updateLanguageTimestamps", () => {
  test("adds new language timestamps when none exist", () => {
    const state = initalStoredSyncState();
    const result = updateLanguageTimestamps(state, [1, 2], 42);
    expect(result.syncLanguages).toHaveLength(2);
    expect(result.syncLanguages).toContainEqual({ languageId: 1, timestamp: 42 });
    expect(result.syncLanguages).toContainEqual({ languageId: 2, timestamp: 42 });
  });

  test("replaces existing timestamp for the same languageId", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [{ languageId: 1, timestamp: 10 }]
    };
    const result = updateLanguageTimestamps(state, [1], 99);
    expect(result.syncLanguages).toHaveLength(1);
    expect(result.syncLanguages[0].timestamp).toBe(99);
  });

  test("preserves other language entries", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [
        { languageId: 1, timestamp: 10 },
        { languageId: 2, timestamp: 20 }
      ]
    };
    const result = updateLanguageTimestamps(state, [1], 99);
    expect(result.syncLanguages).toHaveLength(2);
    const lang2 = result.syncLanguages.find(l => l.languageId === 2);
    expect(lang2!.timestamp).toBe(20);
  });

  test("does not mutate the original state", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [{ languageId: 1, timestamp: 10 }]
    };
    updateLanguageTimestamps(state, [1], 99);
    expect(state.syncLanguages[0].timestamp).toBe(10);
  });

  test("handles empty languageIds array", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [{ languageId: 1, timestamp: 10 }]
    };
    const result = updateLanguageTimestamps(state, [], 99);
    expect(result.syncLanguages).toEqual(state.syncLanguages);
  });
});

describe("resync", () => {
  test("resets all syncLanguage timestamps to 1", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [
        { languageId: 1, timestamp: 100 },
        { languageId: 2, timestamp: 200 }
      ]
    };
    const result = resync(state);
    expect(result.syncLanguages.every(sl => sl.timestamp === 1)).toBe(true);
    expect(result.syncLanguages).toHaveLength(2);
  });

  test("resets downSync to initial state", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      downSync: {
        languages: true,
        baseLessons: true,
        lessons: [1, 2, 3],
        tStrings: { 1: [10, 20] },
        timestamp: 50
      }
    };
    const result = resync(state);
    expect(result.downSync).toEqual(initalStoredSyncState().downSync);
  });

  test("preserves language and upSync state", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [{ languageId: 1, timestamp: 100 }],
      upSync: { dirtyTStrings: [{ masterId: 1, languageId: 3, text: "hi", history: [] }] }
    };
    const result = resync(state);
    expect(result.upSync).toEqual(state.upSync);
  });

  test("does not mutate original state", () => {
    const state: StoredSyncState = {
      ...initalStoredSyncState(),
      syncLanguages: [{ languageId: 1, timestamp: 100 }]
    };
    resync(state);
    expect(state.syncLanguages[0].timestamp).toBe(100);
  });
});
