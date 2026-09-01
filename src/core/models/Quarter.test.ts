/// <reference types="jest" />

import { BaseLesson, TOC_LESSON } from "./Lesson";
import { expectedLessonNumbers, missingQuarterParts, isCompleteQuarter } from "./Quarter";

const makeLesson = (overrides: Partial<BaseLesson> = {}): BaseLesson => ({
  lessonId: 1,
  book: "Luke",
  series: 1,
  lesson: 1,
  version: 1,
  ...overrides,
});

describe("expectedLessonNumbers", () => {
  test("series 1 returns 1..13", () => {
    expect(expectedLessonNumbers(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  test("series 2 returns 14..26", () => {
    expect(expectedLessonNumbers(2)).toEqual([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
  });

  test("series 4 returns 40..52", () => {
    expect(expectedLessonNumbers(4)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52]);
  });
});

describe("isCompleteQuarter / missingQuarterParts", () => {
  test("a full 14-part set (TOC + 13 lessons) is complete with no missing parts", () => {
    const lessons: BaseLesson[] = [
      makeLesson({ book: "Luke", series: 2, lesson: TOC_LESSON }),
      ...Array.from({ length: 13 }, (_, i) =>
        makeLesson({ book: "Luke", series: 2, lesson: 14 + i })
      ),
    ];

    expect(isCompleteQuarter("Luke", 2, lessons)).toBe(true);
    expect(missingQuarterParts("Luke", 2, lessons)).toEqual([]);
  });

  test("a missing TOC is reported", () => {
    const lessons: BaseLesson[] = Array.from({ length: 13 }, (_, i) =>
      makeLesson({ book: "Luke", series: 2, lesson: 14 + i })
    );

    expect(isCompleteQuarter("Luke", 2, lessons)).toBe(false);
    expect(missingQuarterParts("Luke", 2, lessons)).toEqual(["Luke 2-TOC"]);
  });

  test("lessons from a different book/series are ignored when resolving a quarter", () => {
    const lessons: BaseLesson[] = [
      makeLesson({ book: "Acts", series: 2, lesson: TOC_LESSON }),
      makeLesson({ book: "Luke", series: 3, lesson: 14 }),
    ];

    expect(isCompleteQuarter("Luke", 2, lessons)).toBe(false);
    expect(missingQuarterParts("Luke", 2, lessons).length).toBe(14);
  });

  // Real fixture: Luke series 1 is a genuinely incomplete quarter in this codebase
  // (test/docs/serverDocs/ has Luke-1-01..05, 07..13, 99 — lesson 6 is absent).
  test("Luke series 1 (real fixture) is incomplete: missing lesson 6", () => {
    const lessonNumbers = [TOC_LESSON, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13];
    const lessons: BaseLesson[] = lessonNumbers.map((lesson) =>
      makeLesson({ book: "Luke", series: 1, lesson })
    );

    expect(isCompleteQuarter("Luke", 1, lessons)).toBe(false);
    expect(missingQuarterParts("Luke", 1, lessons)).toEqual(["Luke 1-6"]);
  });

  // Guard: reserved cover lesson numbers (97 = A4, 98 = A3) must never be
  // examined by completeness logic — a complete 1-13+TOC quarter stays
  // complete whether or not cover lessons are present, and their
  // translation/version status is irrelevant.
  test("reserved cover lessons 97/98 never affect completeness (present or absent, translated or not)", () => {
    const coreLessons: BaseLesson[] = [
      makeLesson({ book: "Luke", series: 1, lesson: TOC_LESSON }),
      ...Array.from({ length: 13 }, (_, i) =>
        makeLesson({ book: "Luke", series: 1, lesson: 1 + i })
      ),
    ];

    expect(isCompleteQuarter("Luke", 1, coreLessons)).toBe(true);
    expect(missingQuarterParts("Luke", 1, coreLessons)).toEqual([]);

    const withCovers: BaseLesson[] = [
      ...coreLessons,
      makeLesson({ book: "Luke", series: 1, lesson: 97, version: 0 }),
      makeLesson({ book: "Luke", series: 1, lesson: 98, version: 5 }),
    ];

    expect(isCompleteQuarter("Luke", 1, withCovers)).toBe(true);
    expect(missingQuarterParts("Luke", 1, withCovers)).toEqual([]);
  });
});
