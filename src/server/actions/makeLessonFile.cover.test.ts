/// <reference types="jest" />

/**
 * makeLessonFile.cover.test.ts — FR-008 guard test (US15).
 *
 * plan.md's Summary explicitly states "Bilingual/monolingual output
 * (FR-008) requires no code — makeLessonFile handles covers as ordinary
 * lessons." This test does not re-litigate the `motherTongue` pairing rule
 * pinned by `coverExtraction.integration.test.ts` (US13 R2) — it confirms
 * the DOWNLOAD ENDPOINT's engine, `makeLessonFile`, round-trips a REAL
 * cover-master fixture correctly in both of its output modes:
 *
 *  - bilingual  (majorityLangId = a real, distinct language id)
 *  - monolingal (majorityLangId = 0)
 *
 * Every bare cover style extracts `motherTongue: true` (US13 finding), so
 * this test's own oracle is: every extracted string is present, translated,
 * and untouched by `singleLanguageize`'s suppress-queue in BOTH modes — the
 * "never blanked" invariant the US13 R2 gate pins directly on
 * `singleLanguageize`, now observed end-to-end through the real
 * `makeLessonFile` -> `mergeXml` -> re-parse round trip.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { unzip, unlinkRecursive } from "../../core/util/fsUtils";
import parse from "../xml/parse";
import makeLessonFile from "./makeLessonFile";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { Lesson } from "../../core/models/Lesson";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { DocString } from "../../core/models/DocString";

const SERVER_DOCS_DIR = path.join(process.cwd(), "test", "docs", "serverDocs");
const MOTHER_TONGUE_ID = 2;
const MAJORITY_LANG_ID = 3;

const motherLang: Language = {
  languageId: MOTHER_TONGUE_ID,
  name: "MotherTongue",
  code: "mt",
  motherTongue: true,
  progress: [],
  defaultSrcLang: ENGLISH_ID,
};

function coverLesson(): Lesson {
  return {
    lessonId: 97,
    book: "Luke",
    series: 1,
    lesson: 97,
    version: 1,
    lessonStrings: [],
  };
}

/** Real extracted, non-empty cover strings from the committed A4 cover-master fixture. */
function extractRealCoverDocStrings(): DocString[] {
  const fixturePath = path.join(SERVER_DOCS_DIR, "Luke-1-97v01.odt");
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-lessonfile-fixture-"));
  try {
    unzip(fixturePath, extractDir);
    const contentXml = fs.readFileSync(path.join(extractDir, "content.xml"), "utf-8");
    return parse(contentXml, "content").filter((docStr) => docStr.text.trim() !== "");
  } finally {
    unlinkRecursive(extractDir);
  }
}

function extractContentXmlText(odtPath: string): string {
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-lessonfile-output-"));
  try {
    unzip(odtPath, extractDir);
    return fs.readFileSync(path.join(extractDir, "content.xml"), "utf-8");
  } finally {
    unlinkRecursive(extractDir);
  }
}

describe("makeLessonFile — FR-008 bilingual/monolingual cover round trip (real fixture)", () => {
  const realDocStrings = extractRealCoverDocStrings();
  // Guard the fixture assumption this test's oracle depends on: every
  // extracted bare cover style is motherTongue: true (US13 R2 finding).
  // If a future fixture/parse change breaks this, this test should fail
  // loudly here rather than produce a confusing downstream assertion.
  expect(realDocStrings.length).toBeGreaterThan(0);
  expect(realDocStrings.every((docStr) => docStr.motherTongue)).toBe(true);

  const lessonStrings: LessonString[] = realDocStrings.map((docStr, i) => ({
    lessonStringId: i + 1,
    masterId: i + 1,
    lessonId: 97,
    lessonVersion: 1,
    type: docStr.type,
    xpath: docStr.xpath,
    motherTongue: docStr.motherTongue,
  }));

  const translatedTStrings: TString[] = lessonStrings.map((lStr) => ({
    masterId: lStr.masterId,
    languageId: MOTHER_TONGUE_ID,
    text: `translated-${lStr.masterId}`,
    history: [],
  }));

  function storageStub(): Persistence {
    return {
      tStrings: jest.fn().mockResolvedValue(translatedTStrings),
    } as unknown as Persistence;
  }

  test("bilingual mode (majorityLangId != 0) writes every translated string into the real cover ODT", async () => {
    const lesson = { ...coverLesson(), lessonStrings };
    const filepath = await makeLessonFile(storageStub(), lesson, motherLang, MAJORITY_LANG_ID);

    expect(fs.existsSync(filepath)).toBe(true);
    const contentXml = extractContentXmlText(filepath);
    for (const tStr of translatedTStrings) {
      expect(contentXml).toContain(tStr.text);
    }
  });

  test("monolingual mode (majorityLangId = 0) also writes every translated string, never suppressed", async () => {
    const lesson = { ...coverLesson(), lessonStrings };
    const filepath = await makeLessonFile(storageStub(), lesson, motherLang, 0);

    expect(fs.existsSync(filepath)).toBe(true);
    const contentXml = extractContentXmlText(filepath);
    for (const tStr of translatedTStrings) {
      expect(contentXml).toContain(tStr.text);
    }
  });
});
