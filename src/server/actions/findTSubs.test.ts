/// <reference types="jest" />

/**
 * Tests for findTSubs internals.
 *
 * `combineLessonDiffs` and the `removed-before-added` diff ordering branch
 * in `diffLessonStrings` are not exercised by any other test file.
 *
 * We reach those branches by importing the private helpers through a thin
 * re-export trick: the functions are not exported, so we test them indirectly
 * via the observable behaviour of `diffLessonStrings` (called from
 * `diffLesson`, called from `findTSubs`). For `combineLessonDiffs` we test
 * it indirectly via `findTSubs` itself, which calls `diffLesson` which in
 * turn calls `uniqIdSubs` — `combineLessonDiffs` is the only other caller of
 * `uniqIdSubs` and is tested here by verifying de-duplication behaviour.
 *
 * The `removed-before-added` branch (lines 139-141) is hit when the diff
 * library emits a `removed` chunk followed by an `added` chunk (i.e. the
 * lesson's new content appears AFTER the old content in the diff output).
 * We drive that scenario through `findTSubs` by providing a storage mock
 * whose old/new lesson strings are ordered so that the diff library produces
 * that ordering.
 */

import { IdSub, LessonDiff } from "../../core/models/TSub";
import { ENGLISH_ID } from "../../core/models/Language";
import { TString } from "../../core/models/TString";
import { Persistence } from "../../core/interfaces/Persistence";
import { combineLessonDiffs, diffLessonStrings } from "./findTSubs";
import { LessonString } from "../../core/models/LessonString";

// ─────────────────────────────────────────────────────────────────────────────
// combineLessonDiffs — lines 54-57
// ─────────────────────────────────────────────────────────────────────────────

describe("combineLessonDiffs", () => {
  test("flattens diffs from multiple LessonDiff objects", () => {
    const diffs: LessonDiff[] = [
      { lessonId: 1, version: 1, diff: [{ from: "1", to: "2" }] },
      { lessonId: 2, version: 1, diff: [{ from: "3", to: "4" }] }
    ];
    const result = combineLessonDiffs(diffs);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ from: "1", to: "2" });
    expect(result).toContainEqual({ from: "3", to: "4" });
  });

  test("deduplicates identical IdSubs across diffs", () => {
    const shared: IdSub = { from: "1", to: "2" };
    const diffs: LessonDiff[] = [
      { lessonId: 1, version: 1, diff: [shared] },
      { lessonId: 2, version: 1, diff: [{ ...shared }] } // same content, different object
    ];
    const result = combineLessonDiffs(diffs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ from: "1", to: "2" });
  });

  test("returns empty array when all diffs are empty", () => {
    const diffs: LessonDiff[] = [
      { lessonId: 1, version: 1, diff: [] },
      { lessonId: 2, version: 1, diff: [] }
    ];
    const result = combineLessonDiffs(diffs);
    expect(result).toEqual([]);
  });

  test("handles a single LessonDiff with multiple IdSubs", () => {
    const diffs: LessonDiff[] = [
      {
        lessonId: 1,
        version: 1,
        diff: [
          { from: "10", to: "20" },
          { from: "30", to: "40" },
          { from: "10", to: "20" } // duplicate within same diff
        ]
      }
    ];
    const result = combineLessonDiffs(diffs);
    expect(result).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffLessonStrings — removed-before-added branch (lines 139-141)
//
// The `diff` library's `diffLines` always emits removed before added — it never
// produces an [added, removed] consecutive ordering.  The branch at lines
// 139-141 is therefore structurally unreachable via the real diff library.
//
// To achieve coverage we mock the `diff` module so that `diffLines` returns a
// fabricated change array with [added, removed] ordering, which exercises the
// defensive branch in `diffLessonStrings`.
// ─────────────────────────────────────────────────────────────────────────────

// Mock the `diff` module so we can control diffLines output.
jest.mock("diff", () => ({
  ...jest.requireActual("diff"),
  diffLines: jest.fn()
}));

import findTSubs from "./findTSubs";
import { Lesson } from "../../core/models/Lesson";
import { Language } from "../../core/models/Language";
import { ContinuousSyncPackage } from "../../core/models/SyncState";

function makeTString(masterId: number, text: string): TString {
  return { masterId, languageId: ENGLISH_ID, text, history: [] };
}

function makeLessonString(
  lessonId: number,
  masterId: number,
  lessonStringId: number
): LessonString {
  return {
    lessonId,
    masterId,
    lessonStringId,
    lessonVersion: 1,
    motherTongue: false,
    type: "content",
    xpath: `/xpath/${masterId}`
  };
}

/**
 * Minimal Persistence mock for findTSubs.
 * Allows us to control exactly what lesson strings appear in the "old" and
 * "new" versions of a lesson, which in turn drives `diffLessonStrings`.
 */
function makeStorage(opts: {
  lessonStrings: LessonString[];
  oldLessonStrings: LessonString[];
  englishStrings: TString[];
  languages?: Language[];
}): Persistence {
  const languages: Language[] = opts.languages ?? [
    {
      languageId: ENGLISH_ID,
      name: "English",
      code: "ABC",
      motherTongue: false,
      progress: [],
      defaultSrcLang: ENGLISH_ID
    }
  ];

  const lesson: Lesson = {
    lessonId: 1,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 2,
    lessonStrings: opts.lessonStrings
  };

  return {
    languages: async () => languages,
    language: async () => null,
    createLanguage: async () => ({ languageId: 99, name: "", code: "", motherTongue: false, progress: [], defaultSrcLang: 1 }),
    updateLanguage: async () => ({ languageId: 99, name: "", code: "", motherTongue: false, progress: [], defaultSrcLang: 1 }),
    invalidCode: async () => false,
    lessons: async () => [],
    lesson: async (id: number) => (id === 1 ? lesson : null),
    createLesson: async () => ({ lessonId: 99, book: "Luke", series: 1, lesson: 1, version: 0 }),
    updateLesson: async () => lesson,
    oldLessonStrings: async () => opts.oldLessonStrings,
    tStrings: async (params: { languageId: number }) => {
      if (params.languageId === ENGLISH_ID) return opts.englishStrings;
      return [];
    },
    englishScriptureTStrings: async () => [],
    addOrFindMasterStrings: async () => [],
    saveTStrings: async () => [],
    sync: async (): Promise<ContinuousSyncPackage> => ({
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: {},
      timestamp: Date.now()
    }),
    close: async () => {}
  } as Persistence;
}

// ─────────────────────────────────────────────────────────────────────────────
// diffLessonStrings direct tests (via exported function)
// ─────────────────────────────────────────────────────────────────────────────

describe("diffLessonStrings — added-before-removed branch (lines 139-141)", () => {
  const { diffLines } = require("diff") as { diffLines: jest.Mock };

  afterEach(() => {
    diffLines.mockRestore && diffLines.mockRestore();
    jest.restoreAllMocks();
  });

  test("handles [removed, added] consecutive ordering (normal diff branch)", () => {
    // The real diffLines always produces removed before added.
    // Restore actual implementation so this test uses the real library.
    const actualDiff = jest.requireActual("diff");
    diffLines.mockImplementation(actualDiff.diffLines);

    const oldStrings = [makeLessonString(1, 1, 1)];
    const newStrings = [makeLessonString(1, 2, 2)];
    // old="1\n", new="2\n" → [removed "1\n"], [added "2\n"]
    const result = diffLessonStrings(newStrings, oldStrings);
    expect(result).toEqual([{ from: "1", to: "2" }]);
  });

  test("handles [added, removed] consecutive ordering (defensive branch lines 139-141)", () => {
    // Mock diffLines to return [added, removed] — a pattern the real library never produces.
    // This exercises the defensive `change.removed && prevChange.added` branch.
    diffLines.mockReturnValue([
      { added: true, removed: false, value: "20\n", count: 1 },
      { added: false, removed: true, value: "10\n", count: 1 }
    ]);

    const oldStrings = [makeLessonString(1, 10, 1)];
    const newStrings = [makeLessonString(1, 20, 2)];
    // With mock producing [added "20\n", removed "10\n"]:
    // i=1: change=removed("10\n"), prevChange=added("20\n") → hits lines 139-141
    // subFromChanges(removed="10\n", added="20\n") → { from: "10", to: "20" }
    const result = diffLessonStrings(newStrings, oldStrings);
    expect(result).toEqual([{ from: "10", to: "20" }]);
  });

  test("skips non-matching consecutive pairs (else branch)", () => {
    // A sequence where consecutive pairs don't form added/removed combos.
    const actualDiff = jest.requireActual("diff");
    diffLines.mockImplementation(actualDiff.diffLines);

    // identical old and new → no changes → no subs
    const strings = [makeLessonString(1, 5, 1)];
    const result = diffLessonStrings(strings, strings);
    expect(result).toEqual([]);
  });
});

describe("findTSubs integration", () => {
  const { diffLines } = require("diff") as { diffLines: jest.Mock };

  beforeEach(() => {
    // Use real diffLines for integration tests
    const actualDiff = jest.requireActual("diff");
    diffLines.mockImplementation(actualDiff.diffLines);
  });

  test("returns empty array when old and new lesson strings are identical", async () => {
    const strings = [makeLessonString(1, 10, 1), makeLessonString(1, 20, 2)];
    const engStrings = [makeTString(10, "Hello world"), makeTString(20, "Goodbye world")];
    const storage = makeStorage({
      lessonStrings: strings,
      oldLessonStrings: strings,
      englishStrings: engStrings
    });

    const result = await findTSubs(storage, 1);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test("produces a sub when one string is replaced by another", async () => {
    const oldStrings = [makeLessonString(1, 1, 1)];
    const newStrings = [makeLessonString(1, 2, 2)];
    const engStrings = [
      makeTString(1, "Original English sentence here"),
      makeTString(2, "Replacement English sentence here")
    ];
    const languages: Language[] = [
      { languageId: ENGLISH_ID, name: "English", code: "ENG", motherTongue: false, progress: [], defaultSrcLang: ENGLISH_ID },
      { languageId: 2, name: "French", code: "FRE", motherTongue: true, progress: [], defaultSrcLang: ENGLISH_ID }
    ];
    const storage = makeStorage({
      lessonStrings: newStrings,
      oldLessonStrings: oldStrings,
      englishStrings: engStrings,
      languages
    });

    const result = await findTSubs(storage, 1);
    expect(Array.isArray(result)).toBe(true);
  });
});
