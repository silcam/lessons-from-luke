/// <reference types="jest" />

/**
 * makeLessonFile.cover.test.ts — FR-008 guard test (US15), updated
 * 2026-08-03 for the real BILINGUAL cover masters (see
 * specs/brainstorms/2026-08-03-bilingual-cover-masters-requirements.md).
 *
 * Round-trips the real committed A4 bilingual cover-master fixture through
 * `makeLessonFile` -> `mergeXml` -> re-extract in both output modes and pins
 * the new invariants:
 *
 *  - bilingual (majorityLangId = a real, distinct language id): every
 *    mother-tongue template field carries the mother-tongue translation AND
 *    the two source-language repetition paragraphs are present, populated
 *    from the majority language.
 *  - monolingual (majorityLangId = 0): no paragraph referencing a repetition
 *    style (directly or through an automatic-style parent) survives — the
 *    derived monolingual cover is "the bilingual version saved without the
 *    repetitions" — while every mother-tongue translation is still present.
 *
 * The masterId assignment below mirrors `addOrFindMasterStrings`
 * (PGStorage): exact, case-sensitive text dedup within the upload. That
 * gives the title repetition ("Lessons from Luke") the SAME masterId as its
 * M.T. sibling, but the subtitle repetition ("Teacher’s guide") a DIFFERENT
 * masterId than the M.T. field ("Teacher’s Guide") — the case mismatch that
 * defeats `singleLanguageize`'s suppress-queue and motivates the
 * style-driven removal (coverRepetitions.ts).
 */

import fs from "fs";
import os from "os";
import path from "path";
import libxmljs2, { Element } from "libxmljs2";
import { unzip, unlinkRecursive } from "../../core/util/fsUtils";
import parse from "../xml/parse";
import { extractNamespaces } from "../xml/mergeXml";
import { COVER_REPETITION_PARAGRAPH_STYLES } from "../xml/coverRepetitions";
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
  archived: false,
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

/**
 * Real extracted, non-empty cover strings from the committed A4 bilingual
 * cover-master fixture — content AND meta, like a real upload. The meta
 * strings matter: meta.xml never declares the text:/style: namespace
 * prefixes, so the repetition removal must not run against it (regression:
 * "XPath error : Undefined namespace prefix" -> 500 on every monolingual
 * cover download).
 */
function extractRealCoverDocStrings(): DocString[] {
  const fixturePath = path.join(SERVER_DOCS_DIR, "Luke-1-97v01.odt");
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-lessonfile-fixture-"));
  try {
    unzip(fixturePath, extractDir);
    const contentXml = fs.readFileSync(path.join(extractDir, "content.xml"), "utf-8");
    const metaXml = fs.readFileSync(path.join(extractDir, "meta.xml"), "utf-8");
    return [...parse(contentXml, "content"), ...parse(metaXml, "meta")].filter(
      (docStr) => docStr.text.trim() !== ""
    );
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

/** All text:p elements rendering in a cover repetition style, directly or via automatic-style parents. */
function repetitionParagraphs(contentXml: string) {
  const xmlDoc = libxmljs2.parseXml(contentXml);
  const namespaces = extractNamespaces(xmlDoc);
  const styleNames: string[] = [];
  for (const base of COVER_REPETITION_PARAGRAPH_STYLES) {
    styleNames.push(base);
    xmlDoc
      .find<Element>(`//style:style[@style:parent-style-name='${base}']`, namespaces)
      .forEach((style) => {
        const name = style.attr("name")?.value();
        if (name) styleNames.push(name);
      });
  }
  return styleNames.flatMap((name) =>
    xmlDoc.find<Element>(`//text:p[@text:style-name='${name}']`, namespaces)
  );
}

describe("makeLessonFile — FR-008 bilingual/monolingual cover round trip (real bilingual fixture)", () => {
  const realDocStrings = extractRealCoverDocStrings();
  expect(realDocStrings.length).toBeGreaterThan(0);
  // Fixture guard: the real bilingual master carries exactly two
  // motherTongue: false CONTENT repetition strings (title + subtitle) plus
  // at least one meta string (dc:title), which is always motherTongue: false.
  const repetitionStrings = realDocStrings.filter(
    (docStr) => !docStr.motherTongue && docStr.type === "content"
  );
  expect(repetitionStrings.map((docStr) => docStr.text).sort()).toEqual(
    ["Lessons from Luke", "Teacher’s guide"].sort()
  );
  expect(realDocStrings.some((docStr) => docStr.type === "meta")).toBe(true);

  // masterId assignment mirroring addOrFindMasterStrings: exact-text dedup.
  const masterIdByText = new Map<string, number>();
  const lessonStrings: LessonString[] = realDocStrings.map((docStr, i) => {
    if (!masterIdByText.has(docStr.text)) masterIdByText.set(docStr.text, masterIdByText.size + 1);
    return {
      lessonStringId: i + 1,
      masterId: masterIdByText.get(docStr.text)!,
      lessonId: 97,
      lessonVersion: 1,
      type: docStr.type,
      xpath: docStr.xpath,
      motherTongue: docStr.motherTongue,
    };
  });
  // Dedup guard: the title repetition shares its M.T. sibling's masterId
  // (identical text), the subtitle repetition does not (case mismatch).
  expect(masterIdByText.has("Teacher’s Guide")).toBe(true);
  expect(masterIdByText.has("Teacher’s guide")).toBe(true);
  expect(masterIdByText.get("Teacher’s Guide")).not.toBe(masterIdByText.get("Teacher’s guide"));

  const allMasterIds = [...new Set(lessonStrings.map((lStr) => lStr.masterId))];
  const tStringsFor = (languageId: number, prefix: string): TString[] =>
    allMasterIds.map((masterId) => ({
      masterId,
      languageId,
      text: `${prefix}-${masterId}`,
      history: [],
    }));

  /** languageId-aware stub: mother-tongue and majority languages return distinct texts. */
  function storageStub(): Persistence {
    return {
      tStrings: jest.fn().mockImplementation(({ languageId }: { languageId: number }) => {
        if (languageId === MOTHER_TONGUE_ID) return Promise.resolve(tStringsFor(languageId, "mt"));
        return Promise.resolve(tStringsFor(languageId, "maj"));
      }),
    } as unknown as Persistence;
  }

  const mtLessonStrings = lessonStrings.filter((lStr) => lStr.motherTongue);
  const repetitionLessonStrings = lessonStrings.filter(
    (lStr) => !lStr.motherTongue && lStr.type === "content"
  );

  test("bilingual mode (majorityLangId != 0) keeps the repetition paragraphs, populated from the majority language", async () => {
    const lesson = { ...coverLesson(), lessonStrings };
    const filepath = await makeLessonFile(storageStub(), lesson, motherLang, MAJORITY_LANG_ID);

    expect(fs.existsSync(filepath)).toBe(true);
    const contentXml = extractContentXmlText(filepath);
    for (const lStr of mtLessonStrings) {
      expect(contentXml).toContain(`mt-${lStr.masterId}`);
    }
    const repetitions = repetitionParagraphs(contentXml);
    expect(repetitions).toHaveLength(2);
    const repetitionTexts = repetitions.map((p) => p.text());
    for (const lStr of repetitionLessonStrings) {
      expect(repetitionTexts).toContain(`maj-${lStr.masterId}`);
    }
  });

  test("monolingual mode (majorityLangId = 0) removes every repetition paragraph while keeping all mother-tongue strings", async () => {
    const lesson = { ...coverLesson(), lessonStrings };
    const filepath = await makeLessonFile(storageStub(), lesson, motherLang, 0);

    expect(fs.existsSync(filepath)).toBe(true);
    const contentXml = extractContentXmlText(filepath);
    for (const lStr of mtLessonStrings) {
      expect(contentXml).toContain(`mt-${lStr.masterId}`);
    }
    expect(repetitionParagraphs(contentXml)).toHaveLength(0);
  });
});
