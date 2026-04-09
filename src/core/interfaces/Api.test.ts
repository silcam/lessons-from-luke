/// <reference types="jest" />

import {
  encodeLanguageTimestamps,
  decodeLanguageTimestamps
} from "./Api";

describe("encodeLanguageTimestamps", () => {
  test("encodes a list of language timestamps to a comma-separated string", () => {
    const result = encodeLanguageTimestamps([
      { languageId: 2, timestamp: 1594232387331 },
      { languageId: 3, timestamp: 1600000000000 }
    ]);
    expect(result).toBe("2-1594232387331,3-1600000000000");
  });

  test("returns empty string for empty array", () => {
    expect(encodeLanguageTimestamps([])).toBe("");
  });

  test("encodes single language timestamp", () => {
    expect(encodeLanguageTimestamps([{ languageId: 1, timestamp: 100 }])).toBe("1-100");
  });
});

describe("decodeLanguageTimestamps", () => {
  test("returns empty array for empty string", () => {
    expect(decodeLanguageTimestamps("")).toEqual([]);
  });

  test("decodes a single language-timestamp pair", () => {
    expect(decodeLanguageTimestamps("2-1594232387331")).toEqual([
      { languageId: 2, timestamp: 1594232387331 }
    ]);
  });

  test("decodes multiple language-timestamp pairs", () => {
    const result = decodeLanguageTimestamps("2-1594232387331,3-1600000000000");
    expect(result).toEqual([
      { languageId: 2, timestamp: 1594232387331 },
      { languageId: 3, timestamp: 1600000000000 }
    ]);
  });

  test("encode and decode are inverse operations", () => {
    const timestamps = [
      { languageId: 2, timestamp: 1594232387331 },
      { languageId: 3, timestamp: 1600000000000 }
    ];
    expect(decodeLanguageTimestamps(encodeLanguageTimestamps(timestamps))).toEqual(timestamps);
  });

  test("throws when languageId is invalid", () => {
    expect(() => decodeLanguageTimestamps("0-1594232387331")).toThrow();
  });

  test("throws when timestamp is invalid", () => {
    expect(() => decodeLanguageTimestamps("2-0")).toThrow();
  });
});
