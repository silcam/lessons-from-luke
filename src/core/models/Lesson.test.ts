/// <reference types="jest" />

import {
  lessonName,
  documentName,
  lessonStringsFromLesson,
  lessonCompare,
  isTOCLesson,
  TOC_LESSON,
  BaseLesson,
  Lesson
} from "./Lesson";

const makeLesson = (overrides = {}): BaseLesson => ({
  lessonId: 1,
  book: "Luke",
  series: 1,
  lesson: 1,
  version: 1,
  ...overrides
});

describe("isTOCLesson", () => {
  test("returns true for TOC lessons", () => {
    expect(isTOCLesson(makeLesson({ lesson: TOC_LESSON }))).toBe(true);
  });

  test("returns false for regular lessons", () => {
    expect(isTOCLesson(makeLesson({ lesson: 1 }))).toBe(false);
  });
});

describe("lessonName", () => {
  test("returns empty string for null lesson", () => {
    expect(lessonName(null)).toBe("");
  });

  test("returns empty string for undefined lesson", () => {
    expect(lessonName(undefined)).toBe("");
  });

  test("returns TOC name for TOC lessons", () => {
    const lesson = makeLesson({ book: "Luke", series: 2, lesson: TOC_LESSON });
    expect(lessonName(lesson)).toBe("Luke 2-TOC");
  });

  test("returns series-lesson name for regular lessons", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: 3 });
    expect(lessonName(lesson)).toBe("Luke 1-3");
  });

  test("applies translation function to book name", () => {
    const lesson = makeLesson({ book: "Acts", series: 1, lesson: 1 });
    const t = (s: string) => (s === "Acts" ? "Actes" : s);
    expect(lessonName(lesson, t)).toBe("Actes 1-1");
  });

  test("applies translation function to TOC book name", () => {
    const lesson = makeLesson({ book: "Luke", series: 3, lesson: TOC_LESSON });
    const t = (s: string) => (s === "Luke" ? "Luc" : s);
    expect(lessonName(lesson, t)).toBe("Luc 3-TOC");
  });
});

describe("documentName", () => {
  test("returns TOC document name for TOC lessons", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: TOC_LESSON });
    expect(documentName("French", lesson)).toBe("French_Luke-Q1-TOC.odt");
  });

  test("returns zero-padded lesson document name for regular lessons", () => {
    const lesson = makeLesson({ book: "Luke", series: 2, lesson: 5 });
    expect(documentName("English", lesson)).toBe("English_Luke-Q2-L05.odt");
  });

  test("returns Acts document name", () => {
    const lesson = makeLesson({ book: "Acts", series: 1, lesson: 12 });
    expect(documentName("Swahili", lesson)).toBe("Swahili_Acts-Q1-L12.odt");
  });
});

describe("lessonStringsFromLesson", () => {
  test("returns lesson strings when lesson has them", () => {
    const ls = { lessonStringId: 1, masterId: 1, lessonId: 1, lessonVersion: 1, type: "content" as const, xpath: "/", motherTongue: false };
    const lesson: Lesson = { ...makeLesson(), lessonStrings: [ls] };
    expect(lessonStringsFromLesson(lesson)).toEqual([ls]);
  });

  test("returns empty array for BaseLesson without lessonStrings", () => {
    const lesson = makeLesson();
    expect(lessonStringsFromLesson(lesson)).toEqual([]);
  });
});

describe("lessonCompare", () => {
  test("sorts Luke before Acts", () => {
    const luke = makeLesson({ book: "Luke", series: 1, lesson: 1 });
    const acts = makeLesson({ book: "Acts", series: 1, lesson: 1 });
    expect(lessonCompare(luke, acts)).toBeLessThan(0);
  });

  test("sorts by series within same book", () => {
    const s1 = makeLesson({ book: "Luke", series: 1, lesson: 1 });
    const s2 = makeLesson({ book: "Luke", series: 2, lesson: 1 });
    expect(lessonCompare(s1, s2)).toBeLessThan(0);
  });

  test("sorts by lesson number within same series", () => {
    const l1 = makeLesson({ book: "Luke", series: 1, lesson: 1 });
    const l2 = makeLesson({ book: "Luke", series: 1, lesson: 5 });
    expect(lessonCompare(l1, l2)).toBeLessThan(0);
  });

  test("returns 0 for identical lessons", () => {
    const a = makeLesson();
    const b = makeLesson();
    expect(lessonCompare(a, b)).toBe(0);
  });
});
