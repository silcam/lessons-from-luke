/// <reference types="jest" />

import { Language } from "../../core/models/Language";
import deriveMajorityLanguageId from "./deriveMajorityLanguageId";

/**
 * RED: deriveMajorityLanguageId — the shared mode → majorityLanguageId
 * derivation assembleQuarter must reuse (US2, FR-004/FR-005). See
 * specs/007-assembled-quarter-download/data-model.md "AssemblyMode" and
 * spec.md "User Story 2".
 *
 * Mirrors the existing per-lesson derivation in documentsController.ts:
 * `language.motherTongue ? language.defaultSrcLang : language.languageId`
 * for `"bilingual"`; `"single-language"` always resolves to `0`.
 */
function makeLanguage(overrides: Partial<Language>): Language {
  return {
    languageId: 3,
    name: "Test Language",
    code: "tst",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
    ...overrides,
  };
}

describe("deriveMajorityLanguageId", () => {
  it("bilingual + motherTongue language resolves to the language's defaultSrcLang", () => {
    const language = makeLanguage({ motherTongue: true, defaultSrcLang: 1, languageId: 3 });
    expect(deriveMajorityLanguageId("bilingual", language)).toBe(1);
  });

  it("bilingual + non-motherTongue language resolves to the language's own id (self)", () => {
    const language = makeLanguage({ motherTongue: false, defaultSrcLang: 1, languageId: 3 });
    expect(deriveMajorityLanguageId("bilingual", language)).toBe(3);
  });

  it("single-language mode always resolves to 0, regardless of motherTongue", () => {
    const motherTongueLanguage = makeLanguage({ motherTongue: true, defaultSrcLang: 1 });
    const otherLanguage = makeLanguage({ motherTongue: false, defaultSrcLang: 2 });
    expect(deriveMajorityLanguageId("single-language", motherTongueLanguage)).toBe(0);
    expect(deriveMajorityLanguageId("single-language", otherLanguage)).toBe(0);
  });
});
