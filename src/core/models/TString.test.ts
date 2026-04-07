/// <reference types="jest" />

import {
  equal,
  isTString,
  newTString,
  newTStringFromSrc,
  sqlizeTString,
  TString
} from "./TString";
import { LessonString } from "./LessonString";
import { Language } from "./Language";

const makeTString = (overrides = {}): TString => ({
  masterId: 1,
  languageId: 2,
  text: "Hello",
  history: [],
  ...overrides
});

const makeLessonString = (): LessonString => ({
  lessonStringId: 10,
  masterId: 5,
  lessonId: 1,
  lessonVersion: 1,
  type: "content",
  xpath: "/root",
  motherTongue: false
});

const makeLanguage = (): Language => ({
  languageId: 3,
  name: "French",
  code: "fr",
  motherTongue: false,
  progress: [],
  defaultSrcLang: 1
});

describe("equal", () => {
  test("returns true for identical TStrings", () => {
    const a = makeTString();
    const b = makeTString();
    expect(equal(a, b)).toBe(true);
  });

  test("returns false when masterId differs", () => {
    const a = makeTString({ masterId: 1 });
    const b = makeTString({ masterId: 2 });
    expect(equal(a, b)).toBe(false);
  });

  test("returns false when languageId differs", () => {
    const a = makeTString({ languageId: 1 });
    const b = makeTString({ languageId: 2 });
    expect(equal(a, b)).toBe(false);
  });

  test("returns false when lessonStringId differs", () => {
    const a = makeTString({ lessonStringId: 1 });
    const b = makeTString({ lessonStringId: 2 });
    expect(equal(a, b)).toBe(false);
  });
});

describe("isTString", () => {
  test("returns true for valid TString", () => {
    expect(isTString(makeTString())).toBe(true);
  });

  test("returns false when masterId is wrong type", () => {
    expect(isTString({ masterId: "1", languageId: 2, text: "hi", history: [] } as any)).toBe(false);
  });

  test("returns false when text is missing", () => {
    expect(isTString({ masterId: 1, languageId: 2, history: [] } as any)).toBe(false);
  });

  test("returns false when history is not array-like object", () => {
    expect(isTString({ masterId: 1, languageId: 2, text: "hi", history: 42 } as any)).toBe(false);
  });
});

describe("newTString", () => {
  test("creates TString without source", () => {
    const result = newTString("  Bonjour  ", makeLessonString(), makeLanguage());
    expect(result).toEqual({
      masterId: 5,
      languageId: 3,
      text: "Bonjour",
      history: []
    });
  });

  test("trims whitespace from text", () => {
    const result = newTString("  hello  ", makeLessonString(), makeLanguage());
    expect(result.text).toBe("hello");
  });

  test("includes source info when srcStr provided", () => {
    const src = makeTString({ languageId: 1, text: "Hello", masterId: 5 });
    const result = newTString("Bonjour", makeLessonString(), makeLanguage(), src);
    expect(result.source).toBe("Hello");
    expect(result.sourceLanguageId).toBe(1);
  });
});

describe("newTStringFromSrc", () => {
  test("creates TString from a source TString", () => {
    const src = makeTString({ masterId: 7, languageId: 1, text: "Source" });
    const result = newTStringFromSrc("  Translation  ", 4, src);
    expect(result).toEqual({
      masterId: 7,
      languageId: 4,
      text: "Translation",
      history: [],
      source: "Source",
      sourceLanguageId: 1
    });
  });

  test("trims whitespace from text", () => {
    const src = makeTString();
    const result = newTStringFromSrc("  padded  ", 3, src);
    expect(result.text).toBe("padded");
  });
});

describe("sqlizeTString", () => {
  test("serializes history to JSON string", () => {
    const ts = makeTString({ history: ["old text", "older text"] });
    const result = sqlizeTString(ts);
    expect(result.history).toBe('["old text","older text"]');
  });

  test("converts null source to null", () => {
    const ts = makeTString({ source: null });
    const result = sqlizeTString(ts);
    expect(result.source).toBeNull();
  });

  test("converts undefined source to null", () => {
    const ts = makeTString();
    const result = sqlizeTString(ts);
    expect(result.source).toBeNull();
  });

  test("preserves non-null source", () => {
    const ts = makeTString({ source: "English text" });
    const result = sqlizeTString(ts);
    expect(result.source).toBe("English text");
  });

  test("converts undefined sourceLanguageId to null", () => {
    const ts = makeTString();
    const result = sqlizeTString(ts);
    expect(result.sourceLanguageId).toBeNull();
  });

  test("preserves non-null sourceLanguageId", () => {
    const ts = makeTString({ sourceLanguageId: 1 });
    const result = sqlizeTString(ts);
    expect(result.sourceLanguageId).toBe(1);
  });
});
