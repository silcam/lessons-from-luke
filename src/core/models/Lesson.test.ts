/// <reference types="jest" />

import {
  lessonName,
  documentName,
  lessonStringsFromLesson,
  lessonCompare,
  isTOCLesson,
  TOC_LESSON,
  isCoverLesson,
  coverFormat,
  COVER_A4_LESSON,
  COVER_A3_LESSON,
  BaseLesson,
  Lesson,
} from "./Lesson";

const makeLesson = (overrides = {}): BaseLesson => ({
  lessonId: 1,
  book: "Luke",
  series: 1,
  lesson: 1,
  version: 1,
  ...overrides,
});

describe("isCoverLesson", () => {
  test.each([
    [COVER_A4_LESSON, true],
    [COVER_A3_LESSON, true],
    [1, false],
    [13, false],
    [TOC_LESSON, false],
  ])("isCoverLesson(%i) === %s", (lesson, expected) => {
    expect(isCoverLesson(lesson)).toBe(expected);
  });
});

describe("coverFormat", () => {
  test.each([
    [COVER_A4_LESSON, "A4"],
    [COVER_A3_LESSON, "A3"],
    [1, null],
    [13, null],
    [TOC_LESSON, null],
  ])("coverFormat(%i) === %s", (lesson, expected) => {
    expect(coverFormat(lesson)).toBe(expected);
  });
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

  test("returns 'Cover (A4)' for the A4 cover lesson, never the raw number", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: COVER_A4_LESSON });
    const name = lessonName(lesson);
    expect(name).toBe("Cover (A4)");
    expect(name).not.toContain(String(COVER_A4_LESSON));
  });

  test("returns 'Cover (A3)' for the A3 cover lesson, never the raw number", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: COVER_A3_LESSON });
    const name = lessonName(lesson);
    expect(name).toBe("Cover (A3)");
    expect(name).not.toContain(String(COVER_A3_LESSON));
  });

  test("applies translation function to the cover label", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: COVER_A4_LESSON });
    const t = (s: string) => (s === "Cover (A4)" ? "Couverture (A4)" : s);
    expect(lessonName(lesson, t)).toBe("Couverture (A4)");
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

  test("returns A4 cover document name", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: COVER_A4_LESSON });
    expect(documentName("Espanol", lesson)).toBe("Espanol_Luke-Q1-Cover-A4.odt");
  });

  test("returns A3 cover document name", () => {
    const lesson = makeLesson({ book: "Luke", series: 1, lesson: COVER_A3_LESSON });
    expect(documentName("Espanol", lesson)).toBe("Espanol_Luke-Q1-Cover-A3.odt");
  });

  test("returns cover document name across a different series and language", () => {
    const lesson = makeLesson({ book: "Acts", series: 3, lesson: COVER_A4_LESSON });
    expect(documentName("Swahili", lesson)).toBe("Swahili_Acts-Q3-Cover-A4.odt");
  });
});

describe("lessonStringsFromLesson", () => {
  test("returns lesson strings when lesson has them", () => {
    const ls = {
      lessonStringId: 1,
      masterId: 1,
      lessonId: 1,
      lessonVersion: 1,
      type: "content" as const,
      xpath: "/",
      motherTongue: false,
    };
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
