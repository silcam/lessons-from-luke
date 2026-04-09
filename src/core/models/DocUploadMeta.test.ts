/// <reference types="jest" />

import {
  defaultEnglishUploadMeta,
  isEnglishUpload,
  DocUploadMeta
} from "./DocUploadMeta";
import { ENGLISH_ID } from "./Language";

describe("defaultEnglishUploadMeta", () => {
  test("returns correct default values", () => {
    const meta = defaultEnglishUploadMeta();
    expect(meta.languageId).toBe(ENGLISH_ID);
    expect(meta.book).toBe("Luke");
    expect(meta.series).toBe(1);
    expect(meta.lesson).toBe(1);
  });
});

describe("isEnglishUpload", () => {
  test("returns true for English upload meta", () => {
    const meta: DocUploadMeta = defaultEnglishUploadMeta();
    expect(isEnglishUpload(meta)).toBe(true);
  });

  test("returns false for non-English upload meta", () => {
    const meta: DocUploadMeta = { languageId: 2, lessonId: 5 };
    expect(isEnglishUpload(meta)).toBe(false);
  });
});
