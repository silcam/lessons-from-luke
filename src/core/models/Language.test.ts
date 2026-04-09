/// <reference types="jest" />

import {
  isLanguage,
  isNewLanguage,
  isWithCode,
  languageCompare,
  lessonProgress,
  totalProgress,
  calcLessonProgress,
  sqlizeLang,
  Language
} from "./Language";
import { LessonString } from "./LessonString";
import { TString } from "./TString";

const makeLanguage = (overrides = {}): Language => ({
  languageId: 1,
  name: "English",
  code: "en",
  motherTongue: false,
  progress: [],
  defaultSrcLang: 1,
  ...overrides
});

describe("isLanguage", () => {
  test("returns true for valid language objects", () => {
    expect(isLanguage(makeLanguage())).toBe(true);
  });

  test("returns false when name is missing", () => {
    expect(isLanguage({ languageId: 1, code: "en" })).toBe(false);
  });

  test("returns false when code is wrong type", () => {
    expect(isLanguage({ languageId: 1, name: "English", code: 42 })).toBe(
      false
    );
  });

  test("returns false when languageId is wrong type", () => {
    expect(isLanguage({ languageId: "1", name: "English", code: "en" })).toBe(
      false
    );
  });
});

describe("isNewLanguage", () => {
  test("returns true for valid new language", () => {
    expect(isNewLanguage({ name: "French", defaultSrcLang: 1 })).toBe(true);
  });

  test("returns false when defaultSrcLang is missing", () => {
    expect(isNewLanguage({ name: "French" })).toBe(false);
  });

  test("returns false when name is wrong type", () => {
    expect(isNewLanguage({ name: 123, defaultSrcLang: 1 })).toBe(false);
  });
});

describe("isWithCode", () => {
  test("returns true when item has code and passes type guard", () => {
    const lang = makeLanguage();
    expect(isWithCode(lang, isLanguage)).toBe(true);
  });

  test("returns false when code is missing", () => {
    const noCode = { languageId: 1, name: "English" };
    expect(isWithCode(noCode, isLanguage)).toBe(false);
  });

  test("returns false when type guard fails even with code", () => {
    const badType = { code: "en" };
    expect(isWithCode(badType, isLanguage)).toBe(false);
  });
});

describe("languageCompare", () => {
  test("sorts alphabetically by name", () => {
    const langs = [
      makeLanguage({ name: "Zulu" }),
      makeLanguage({ name: "Arabic" })
    ];
    langs.sort(languageCompare);
    expect(langs[0].name).toBe("Arabic");
    expect(langs[1].name).toBe("Zulu");
  });

  test("returns 0 for same name", () => {
    const a = makeLanguage({ name: "English" });
    const b = makeLanguage({ name: "English" });
    expect(languageCompare(a, b)).toBe(0);
  });
});

describe("lessonProgress", () => {
  test("returns progress for matching lessonId", () => {
    const progress = [{ lessonId: 1, progress: 75 }];
    expect(lessonProgress(progress, 1)).toBe(75);
  });

  test("returns 0 when lessonId not found", () => {
    expect(lessonProgress([], 99)).toBe(0);
  });

  test("returns 0 when matching lesson has zero progress", () => {
    const progress = [{ lessonId: 1, progress: 0 }];
    expect(lessonProgress(progress, 1)).toBe(0);
  });
});

describe("totalProgress", () => {
  test("returns average of progress values rounded", () => {
    const progress = [
      { lessonId: 1, progress: 50 },
      { lessonId: 2, progress: 100 }
    ];
    expect(totalProgress(progress)).toBe(75);
  });

  test("returns 0 for empty progress", () => {
    expect(totalProgress([])).toBe(0);
  });
});

describe("calcLessonProgress", () => {
  const makeLessonString = (overrides = {}): LessonString => ({
    lessonStringId: 1,
    masterId: 1,
    lessonId: 10,
    lessonVersion: 1,
    type: "content",
    xpath: "/root",
    motherTongue: false,
    ...overrides
  });

  const makeTString = (overrides = {}): TString => ({
    masterId: 1,
    languageId: 1,
    text: "Hello",
    history: [],
    ...overrides
  });

  test("returns empty progress when no lessonStrings", () => {
    expect(calcLessonProgress(false, [], [])).toEqual({
      lessonId: 0,
      progress: 0
    });
  });

  test("calculates 100% when all strings translated", () => {
    const lStr = makeLessonString({ masterId: 5 });
    const tStr = makeTString({ masterId: 5 });
    const result = calcLessonProgress(false, [lStr], [tStr]);
    expect(result.progress).toBe(100);
    expect(result.lessonId).toBe(10);
  });

  test("calculates 0% when no strings translated", () => {
    const lStr = makeLessonString({ masterId: 5 });
    const result = calcLessonProgress(false, [lStr], []);
    expect(result.progress).toBe(0);
  });

  test("uses all lessonStrings when motherTongue=false", () => {
    const lStr1 = makeLessonString({ masterId: 1, motherTongue: true });
    const lStr2 = makeLessonString({
      lessonStringId: 2,
      masterId: 2,
      motherTongue: false
    });
    const tStr1 = makeTString({ masterId: 1 });
    // Only masterId 1 is translated, so 50% progress
    const result = calcLessonProgress(false, [lStr1, lStr2], [tStr1]);
    expect(result.progress).toBe(50);
  });

  test("filters to motherTongue strings only when motherTongue=true", () => {
    const lStrMT = makeLessonString({ masterId: 1, motherTongue: true });
    const lStrNotMT = makeLessonString({
      lessonStringId: 2,
      masterId: 2,
      motherTongue: false
    });
    const tStr = makeTString({ masterId: 1 });
    // Only the MT string is considered, and it is translated → 100%
    const result = calcLessonProgress(true, [lStrMT, lStrNotMT], [tStr]);
    expect(result.progress).toBe(100);
  });
});

describe("sqlizeLang", () => {
  test("serializes progress array to JSON string", () => {
    const lang = makeLanguage({ progress: [{ lessonId: 1, progress: 50 }] });
    const result = sqlizeLang(lang);
    expect(result.progress).toBe('[{"lessonId":1,"progress":50}]');
  });

  test("handles empty progress", () => {
    const lang = makeLanguage({ progress: [] });
    const result = sqlizeLang(lang);
    expect(result.progress).toBe("[]");
  });
});
