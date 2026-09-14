/// <reference types="jest" />

/**
 * coverExtraction.integration.test.ts — the executable resolution of
 * research.md R2 / plan.md "FR-005/FR-008 real-fixture check" (US13),
 * updated 2026-08-03 for the curriculum owner's REAL bilingual cover
 * masters (see specs/brainstorms/2026-08-03-bilingual-cover-masters-requirements.md).
 *
 * Parses REAL committed cover-master ODT fixtures
 * (`test/docs/serverDocs/Luke-1-97v01.odt` = A4, `Luke-1-98v01.odt` = A3),
 * derived from the owner's bilingual masters (images shrunk; text and
 * structure untouched), and pins the `motherTongue` classification of every
 * extracted cover string against its concrete downstream consumers.
 *
 * CORRECTED spike outcome: the original US13 spike ran against masters that
 * were mislabeled bilingual but actually monolingual, and concluded "every
 * bare cover style classifies motherTongue: true". That holds only for the
 * fill-in-the-blank template fields (title, subtitle, copyright header,
 * address lines). The REAL bilingual masters additionally carry exactly two
 * source-language "repetition" paragraphs — title style
 * `English_20_translation_20_-_20_Cover_20_Title_20_` (trailing space is
 * part of the real style name) and subtitle style
 * `English_20_translation_20_-_20_Cover_20_subtitle` — which are NOT in
 * `knownStyleNames` and therefore extract `motherTongue: false`, exactly
 * like lesson-body majority-language strings. That classification is what
 * keeps them out of the mother-tongue progress denominator and lets
 * bilingual merges populate them from the majority language.
 *
 * `Book_20_number` is a real known style in both fixtures' style tables, but
 * its bound paragraph carries no text — an empty template field. Extraction
 * (`parseNode`) filters whitespace-only nodes, so no DocString is ever
 * emitted for it; a test below pins that the automatic style bound to that
 * field DOES resolve within the `Book_20_number` closure using the same
 * `findStylesToMatch` helper `parse.ts` itself uses.
 */

import fs from "fs";
import os from "os";
import path from "path";
import libxmljs2 from "libxmljs2";
import { unzip, unlinkRecursive } from "../../core/util/fsUtils";
import parse, { findStylesToMatch } from "./parse";
import { extractNamespaces } from "./mergeXml";
import { DocString } from "../../core/models/DocString";
import { calcLessonProgress } from "../../core/models/Language";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";

const SERVER_DOCS_DIR = path.join(process.cwd(), "test", "docs", "serverDocs");

// The real masters' repetition texts. Note the typographic apostrophe and
// the case difference from the M.T. subtitle field ("Teacher’s Guide") —
// that case mismatch is exactly why monolingual derivation is style-driven
// (coverRepetitions.ts) instead of relying on text-equality masterId dedup.
const TITLE_REPETITION = "Lessons from Luke";
const SUBTITLE_REPETITION = "Teacher’s guide";

function extractContentXml(fixtureName: string): string {
  const fixturePath = path.join(SERVER_DOCS_DIR, fixtureName);
  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-fixture-"));
  try {
    unzip(fixturePath, extractDir);
    return fs.readFileSync(path.join(extractDir, "content.xml"), "utf-8");
  } finally {
    unlinkRecursive(extractDir);
  }
}

/** Non-empty extracted strings only — trims the parser's own whitespace-only noise. */
function nonEmpty(docStrings: DocString[]): DocString[] {
  return docStrings.filter((docStr) => docStr.text.trim() !== "");
}

describe.each([
  ["A4 (97)", "Luke-1-97v01.odt"],
  ["A3 (98)", "Luke-1-98v01.odt"],
])("cover master %s (%s) — real-fixture motherTongue classification", (_label, fixtureName) => {
  let contentXml: string;
  let extracted: DocString[];

  beforeAll(() => {
    contentXml = extractContentXml(fixtureName);
    extracted = nonEmpty(parse(contentXml, "content"));
  });

  // --- Consumer 1: extracted flag value ------------------------------------

  test("extracts at least the title, copyright header, and all three address lines", () => {
    const texts = extracted.map((d) => d.text);
    expect(texts).toEqual(expect.arrayContaining(["Publisher address", "City, Region", "Country"]));
    expect(texts.join(" ")).toContain("Lessons from");
    expect(texts.join(" ")).toContain("Luke");
  });

  test("classifies exactly the two source-language repetition strings as motherTongue: false", () => {
    const repetitions = extracted.filter((docStr) => !docStr.motherTongue);
    expect(repetitions.map((docStr) => docStr.text).sort()).toEqual(
      [TITLE_REPETITION, SUBTITLE_REPETITION].sort()
    );
  });

  test("classifies every bare cover-style template field as motherTongue: true", () => {
    const templateFields = extracted.filter((docStr) => docStr.motherTongue);
    expect(templateFields.length).toBeGreaterThan(0);
    const texts = templateFields.map((docStr) => docStr.text);
    expect(texts).toEqual(expect.arrayContaining(["Publisher address", "City, Region", "Country"]));
    // The M.T. title and subtitle fields (populated with source text in the
    // master) must stay in the mother-tongue set even though the repetition
    // twins of the same/similar text are excluded.
    expect(texts).toContain("Lessons from Luke");
    expect(texts.join(" ")).toContain("Teacher’s Guide");
  });

  test("the Book_20_number field's bound automatic style resolves within the known-style closure (would extract motherTongue: true if populated)", () => {
    const xmlDoc = libxmljs2.parseXml(contentXml);
    const namespaces = extractNamespaces(xmlDoc);
    const matchedStyles = findStylesToMatch(xmlDoc, namespaces, "Book_20_number");
    // Only assert this fixture family actually declares the style at all;
    // not every fixture binds an automatic style to it.
    const declaresBookNumberStyle = xmlDoc
      .root()!
      .find("//style:style[@style:parent-style-name='Book_20_number']", namespaces).length;
    if (declaresBookNumberStyle > 0) {
      expect(matchedStyles.length).toBeGreaterThan(0);
    }
  });

  // --- Consumer 2: calcLessonProgress completeness semantics ---------------

  describe("calcLessonProgress completeness (Language.ts)", () => {
    function toLessonStrings(docStrings: DocString[]): LessonString[] {
      return docStrings.map((docStr, i) => ({
        lessonStringId: i + 1,
        masterId: i + 1,
        lessonId: 97,
        lessonVersion: 1,
        type: "content",
        xpath: docStr.xpath,
        motherTongue: docStr.motherTongue,
      }));
    }

    test("reaches 100% when every motherTongue string is translated — repetition strings do not inflate the denominator", () => {
      const lessonStrings = toLessonStrings(extracted);
      const mtOnly = lessonStrings.filter((lStr) => lStr.motherTongue);
      // The two repetition strings are excluded from the mother-tongue set.
      expect(mtOnly.length).toBe(lessonStrings.length - 2);

      const mtTranslated: TString[] = mtOnly.map((lStr) => ({
        masterId: lStr.masterId,
        languageId: 2,
        text: `translated-${lStr.masterId}`,
        history: [],
      }));

      const fullProgress = calcLessonProgress(true, lessonStrings, mtTranslated);
      expect(fullProgress.progress).toBe(100);

      const missingOne = mtTranslated.slice(0, -1);
      const partialProgress = calcLessonProgress(true, lessonStrings, missingOne);
      expect(partialProgress.progress).toBeLessThan(100);
    });

    test("zero translations means zero progress", () => {
      const lessonStrings = toLessonStrings(extracted);
      const zeroProgress = calcLessonProgress(true, lessonStrings, []);
      expect(zeroProgress.progress).toBe(0);
    });
  });
});
