/// <reference types="jest" />

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-electron-data"),
    isPackaged: false
  }
}));

jest.mock("./DesktopApp", () => ({
  default: class MockDesktopApp {}
}));

import os from "os";
import path from "path";
import fs from "fs";
import LocalStorage, { MEMORY_STORE, defaultMemoryStore } from "./LocalStorage";
import { BaseLesson } from "../core/models/Lesson";
import { LessonString } from "../core/models/LessonString";
import { TString } from "../core/models/TString";
import { initalStoredSyncState } from "../core/models/SyncState";

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "ls-test-"));
});

afterEach(() => {
  fs.rmdirSync(testDir, { recursive: true });
});

function makeLesson(lessonId: number): BaseLesson {
  return { lessonId, book: "Luke", series: 1, lesson: lessonId, version: 1 };
}

function makeLessonString(masterId: number, lessonId: number): LessonString {
  return {
    lessonStringId: masterId,
    masterId,
    lessonId,
    lessonVersion: 1,
    type: "content",
    xpath: `/root[${masterId}]`,
    motherTongue: false
  };
}

function makeTStr(masterId: number, languageId: number, text: string): TString {
  return { masterId, languageId, text, history: [] };
}

describe("LocalStorage", () => {
  test("creates base directory if it does not exist", () => {
    const subDir = path.join(testDir, "new-subdir");
    expect(fs.existsSync(subDir)).toBe(false);
    new LocalStorage(subDir);
    expect(fs.existsSync(subDir)).toBe(true);
  });

  test("initializes with default memory store on empty directory", () => {
    const ls = new LocalStorage(testDir);
    const defaults = defaultMemoryStore();
    expect(ls.getLanguages()).toEqual(defaults.languages);
    expect(ls.getLessons()).toEqual(defaults.lessons);
    expect(ls.getSyncState()).toEqual(defaults.syncState);
  });

  test("persists lessons and reloads them after restart", () => {
    const ls = new LocalStorage(testDir);
    const lessons = [makeLesson(1), makeLesson(2)];
    ls.setLessons(lessons);

    const ls2 = new LocalStorage(testDir);
    expect(ls2.getLessons()).toEqual(lessons);
  });

  test("getLessonCount returns zero initially then correct count after setLessons", () => {
    const ls = new LocalStorage(testDir);
    expect(ls.getLessonCount()).toBe(0);
    ls.setLessons([makeLesson(1), makeLesson(2), makeLesson(3)]);
    expect(ls.getLessonCount()).toBe(3);
  });

  test("persists lesson strings to a per-lesson file", () => {
    const ls = new LocalStorage(testDir);
    const strings = [makeLessonString(10, 5), makeLessonString(11, 5)];
    ls.setLessonStrings(5, strings);

    expect(fs.existsSync(path.join(testDir, "lessonStrings_5.json"))).toBe(true);
    expect(ls.getLessonStrings(5)).toEqual(strings);
  });

  test("getLessonStrings returns empty array for unknown lessonId", () => {
    const ls = new LocalStorage(testDir);
    expect(ls.getLessonStrings(999)).toEqual([]);
  });

  test("setTStrings merges with existing tStrings for same language", () => {
    const ls = new LocalStorage(testDir);
    ls.setTStrings(3, [makeTStr(1, 3, "Hello")]);
    ls.setTStrings(3, [makeTStr(2, 3, "World")]);
    const all = ls.getAllTStrings(3);
    expect(all).toHaveLength(2);
    expect(all.map(t => t.masterId)).toContain(1);
    expect(all.map(t => t.masterId)).toContain(2);
  });

  test("getTStrings filters by masterIds in lesson strings", () => {
    const ls = new LocalStorage(testDir);
    ls.setLessonStrings(10, [makeLessonString(1, 10)]);
    ls.setTStrings(3, [makeTStr(1, 3, "Hello"), makeTStr(2, 3, "Other")]);

    const result = ls.getTStrings(3, 10);
    expect(result).toHaveLength(1);
    expect(result[0].masterId).toBe(1);
  });

  test("getTStringCount sums tStrings across all languages", () => {
    const ls = new LocalStorage(testDir);
    ls.setLanguages([
      { languageId: 3, name: "French", motherTongue: false, defaultSrcLang: 1, progress: [] },
      { languageId: 4, name: "German", motherTongue: false, defaultSrcLang: 1, progress: [] }
    ]);
    ls.setTStrings(3, [makeTStr(1, 3, "A"), makeTStr(2, 3, "B")]);
    ls.setTStrings(4, [makeTStr(1, 4, "C")]);
    expect(ls.getTStringCount()).toBe(3);
  });

  test("writeTextFile uses atomic tmp pattern (no leftover _tmp file)", () => {
    const ls = new LocalStorage(testDir);
    ls.setDocPreview(1, "<html>test</html>");
    expect(fs.existsSync(path.join(testDir, "docPreview_1.html"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "docPreview_1.html_tmp"))).toBe(false);
  });

  test("getDocPreview returns empty string when file does not exist", () => {
    const ls = new LocalStorage(testDir);
    expect(ls.getDocPreview(999)).toBe("");
  });

  test("setDocPreview stores content that getDocPreview retrieves", () => {
    const ls = new LocalStorage(testDir);
    ls.setDocPreview(7, '<html><img src="/api/preview">content</html>');
    const preview = ls.getDocPreview(7);
    expect(preview).toContain("content");
  });

  test("setSyncState merges partial updates into existing sync state", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState({ syncLanguages: [{ languageId: 5, timestamp: 42 }] }, null);
    const state = ls.getSyncState();
    expect(state.syncLanguages).toEqual([{ languageId: 5, timestamp: 42 }]);
  });

  test("setLanguages persists across restart", () => {
    const ls = new LocalStorage(testDir);
    ls.setLanguages([
      { languageId: 3, name: "French", motherTongue: false, defaultSrcLang: 1, progress: [] }
    ]);
    const ls2 = new LocalStorage(testDir);
    expect(ls2.getLanguages()).toHaveLength(1);
    expect(ls2.getLanguages()[0].name).toBe("French");
  });

  test("writeLogEntry appends a log file (appendTextFile)", () => {
    const ls = new LocalStorage(testDir);
    ls.writeLogEntry("Network", "Test log entry");
    const files = fs.readdirSync(testDir).filter(f => f.startsWith("LOG-Network"));
    expect(files.length).toBeGreaterThan(0);
  });

  test("logDataUsed appends to a daily data usage file (appendTextFile)", () => {
    const ls = new LocalStorage(testDir);
    ls.logDataUsed(1024);
    const files = fs.readdirSync(testDir).filter(f => f.startsWith("LOG-DataUsage-"));
    expect(files.length).toBeGreaterThan(0);
  });

  test("readFile throws on corrupted JSON", () => {
    const ls = new LocalStorage(testDir);
    // Write corrupted JSON directly
    fs.writeFileSync(path.join(testDir, "lessonStrings_99.json"), "{ bad json");
    expect(() => ls.getLessonStrings(99)).toThrow();
  });

  // Sync state management

  test("getSyncState returns initial state after construction", () => {
    const ls = new LocalStorage(testDir);
    const initial = initalStoredSyncState();
    const state = ls.getSyncState();
    expect(state.language).toBeNull();
    expect(state.downSync).toEqual(initial.downSync);
    expect(state.syncLanguages).toEqual([]);
  });

  test("setSyncState partial update does not overwrite unrelated fields", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState({ syncLanguages: [{ languageId: 5, timestamp: 10 }] }, null);
    ls.setSyncState({ locale: "fr" }, null);
    const state = ls.getSyncState();
    expect(state.syncLanguages).toEqual([{ languageId: 5, timestamp: 10 }]);
    expect(state.locale).toBe("fr");
  });

  test("setSyncState persists changes to disk (reloaded after restart)", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState({ syncLanguages: [{ languageId: 3, timestamp: 99 }] }, null);

    const ls2 = new LocalStorage(testDir);
    expect(ls2.getSyncState().syncLanguages).toEqual([{ languageId: 3, timestamp: 99 }]);
  });

  test("setSyncState sends ON_SYNC_STATE_CHANGE when app is provided", () => {
    const ls = new LocalStorage(testDir);
    const mockWebContents = { send: jest.fn() };
    const mockApp = { getWindow: jest.fn(() => ({ webContents: mockWebContents })) } as any;

    ls.setSyncState({ locale: "en" }, mockApp);
    expect(mockWebContents.send).toHaveBeenCalledWith(
      "onSyncStateChange",
      expect.objectContaining({ locale: "en" })
    );
  });

  test("setSyncState does not throw when app is null", () => {
    const ls = new LocalStorage(testDir);
    expect(() => ls.setSyncState({ locale: "fr" }, null)).not.toThrow();
  });

  // recalcProgress

  test("recalcProgress does nothing when no language is set", () => {
    const ls = new LocalStorage(testDir);
    expect(() => ls.recalcProgress(null)).not.toThrow();
  });

  test("recalcProgress sets empty progress when no lessons", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState(
      {
        language: {
          languageId: 10,
          name: "Batanga",
          code: "btg",
          motherTongue: false,
          progress: [],
          defaultSrcLang: 1
        }
      },
      null
    );
    ls.recalcProgress(null);
    expect(ls.getSyncState().language!.progress).toEqual([]);
  });

  test("recalcProgress computes 100 percent when all tStrings are present", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState(
      {
        language: {
          languageId: 10,
          name: "Batanga",
          code: "btg",
          motherTongue: false,
          progress: [],
          defaultSrcLang: 1
        }
      },
      null
    );
    ls.setLessons([makeLesson(1)]);
    ls.setLessonStrings(1, [makeLessonString(1, 1), makeLessonString(2, 1)]);
    ls.setTStrings(10, [makeTStr(1, 10, "Translated A"), makeTStr(2, 10, "Translated B")]);

    ls.recalcProgress(null);
    const progress = ls.getSyncState().language!.progress;
    expect(progress).toHaveLength(1);
    expect(progress[0].lessonId).toBe(1);
    expect(progress[0].progress).toBe(100);
  });

  test("recalcProgress sends sync state change when app is provided", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState(
      {
        language: {
          languageId: 10,
          name: "Batanga",
          code: "btg",
          motherTongue: false,
          progress: [],
          defaultSrcLang: 1
        }
      },
      null
    );
    const mockWebContents = { send: jest.fn() };
    const mockApp = { getWindow: jest.fn(() => ({ webContents: mockWebContents })) } as any;
    ls.recalcProgress(mockApp);
    expect(mockWebContents.send).toHaveBeenCalled();
  });

  // Migration

  test("migrateLocalStorage upgrades version 1 store to version 2", () => {
    const v1Store = {
      syncState: {
        language: {
          languageId: 10,
          name: "Batanga",
          code: "btg",
          motherTongue: false,
          progress: [],
          defaultSrcLang: 1
        },
        downSync: {},
        upSync: { dirtyTStrings: [] }
      },
      languages: [],
      lessons: [],
      localStorageVersion: 1
    };
    fs.writeFileSync(path.join(testDir, "memoryStore.json"), JSON.stringify(v1Store));
    const ls = new LocalStorage(testDir);
    const state = ls.getSyncState();
    expect(state.syncLanguages).toBeDefined();
    expect(Array.isArray(state.syncLanguages)).toBe(true);
    expect(state.syncLanguages).toContainEqual({ languageId: 10, timestamp: 1 });
    expect(state.syncLanguages).toContainEqual({ languageId: 1, timestamp: 1 });
  });

  test("migrateLocalStorage with no language produces empty syncLanguages", () => {
    const v1Store = {
      syncState: { language: null, downSync: {}, upSync: { dirtyTStrings: [] } },
      languages: [],
      lessons: [],
      localStorageVersion: 1
    };
    fs.writeFileSync(path.join(testDir, "memoryStore.json"), JSON.stringify(v1Store));
    const ls = new LocalStorage(testDir);
    expect(ls.getSyncState().syncLanguages).toEqual([]);
  });

  // Log cleanup (manageLogs)

  test("manageLogs consolidates old DataUsage log files into DataUsageLog", () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yyyy = yesterday.getUTCFullYear();
    const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getUTCDate()).padStart(2, "0");
    const filename = `LOG-DataUsage-${yyyy}-${mm}-${dd}`;
    fs.writeFileSync(path.join(testDir, filename), "512\n256\n");

    const ls = new LocalStorage(testDir);
    const dataUsage = ls.readDataUsed() as { [date: string]: number };

    expect(fs.existsSync(path.join(testDir, filename))).toBe(false);
    const dateKey = `${yyyy}-${mm}-${dd}`;
    expect(dataUsage[dateKey]).toBe(768);
  });

  test("manageLogs deletes old Network log files from last month or earlier", () => {
    const oldFilename = "LOG-Network-2020-01";
    fs.writeFileSync(path.join(testDir, oldFilename), "old log content");
    new LocalStorage(testDir);
    expect(fs.existsSync(path.join(testDir, oldFilename))).toBe(false);
  });

  test("manageLogs keeps current month Network log files", () => {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const currentMonthFilename = `LOG-Network-${yyyy}-${mm}`;
    fs.writeFileSync(path.join(testDir, currentMonthFilename), "current log");
    new LocalStorage(testDir);
    expect(fs.existsSync(path.join(testDir, currentMonthFilename))).toBe(true);
  });

  test("readDataUsed returns empty object when no data usage log exists", () => {
    const ls = new LocalStorage(testDir);
    const usage = ls.readDataUsed();
    expect(typeof usage).toBe("object");
  });

  // removeDocPreview

  test("removeDocPreview does not throw for an existing doc preview", () => {
    const ls = new LocalStorage(testDir);
    ls.setDocPreview(5, "<html>preview</html>");
    expect(() => ls.removeDocPreview(5)).not.toThrow();
  });

  test("removeDocPreview does not throw when preview does not exist", () => {
    const ls = new LocalStorage(testDir);
    expect(() => ls.removeDocPreview(999)).not.toThrow();
  });

  // setProjectLanguageTStrings

  test("setProjectLanguageTStrings appends old text to history", () => {
    const ls = new LocalStorage(testDir);
    ls.setSyncState(
      {
        language: {
          languageId: 10,
          name: "Batanga",
          code: "btg",
          motherTongue: false,
          progress: [],
          defaultSrcLang: 1
        }
      },
      null
    );
    ls.setTStrings(10, [makeTStr(1, 10, "Original")]);
    ls.setProjectLanguageTStrings([makeTStr(1, 10, "Updated")]);

    const all = ls.getAllTStrings(10);
    const updated = all.find(t => t.masterId === 1);
    expect(updated).toBeDefined();
    expect(updated!.text).toBe("Updated");
    expect(updated!.history).toContain("Original");
  });

  test("setProjectLanguageTStrings throws when no project language is set", () => {
    const ls = new LocalStorage(testDir);
    expect(() => ls.setProjectLanguageTStrings([makeTStr(1, 10, "Text")])).toThrow();
  });
});
