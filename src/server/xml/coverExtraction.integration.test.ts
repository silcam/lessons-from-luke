/// <reference types="jest" />

/**
 * coverExtraction.integration.test.ts — the executable resolution of
 * research.md R2 / plan.md "FR-005/FR-008 real-fixture check" (US13).
 *
 * Parses REAL committed cover-master ODT fixtures
 * (`test/docs/serverDocs/Luke-1-97v01.odt` = A4, `Luke-1-98v01.odt` = A3)
 * and pins the `motherTongue` classification of every extracted bare-style
 * cover string against its THREE concrete downstream consumers — per
 * plan.md's "FR-005/FR-008 real-fixture check": "round-trips through
 * makeLessonFile in both modes" is explicitly called out as an
 * INSUFFICIENT assertion, so this gate pins the raw extraction (1),
 * `calcLessonProgress` completeness semantics (2), and `singleLanguageize`
 * monolingual output (3) directly.
 *
 * Spike outcome (see inline notes below): every bare cover style found in
 * the real fixtures — title, subtitle, copyright header, and each address
 * line — classifies `motherTongue: true`, and that IS the correct pairing:
 * these are fill-in-the-blank template fields the translator must render in
 * their own language (not fixed English boilerplate). Per plan.md's
 * "Spike outcome -> action matrix" row 1 ("Bare styles classify
 * motherTongue: true and that is correct pairing"), the required action is
 * "Add the style names to knownStyleNames only — no further change", which
 * a prior Green task (adding `Copyright_20_text` / `Book_20_number`) already
 * did. This test is therefore a GUARD, not a RED: it passes against the
 * current classification and exists to catch any future regression in
 * `knownStyleNames` or the pairing rule.
 *
 * `Book_20_number` is a real known style in both fixtures' style tables, but
 * its bound paragraph carries no text in any of the 8 committed cover
 * fixtures (Luke 1-4, A4 + A3) — an empty template field. Extraction
 * (`parseNode`) filters whitespace-only nodes, so no DocString is ever
 * emitted for it here; part 1 below instead pins that the automatic style
 * bound to that field DOES resolve within the `Book_20_number` closure
 * (i.e., IF the field were populated, it would extract `motherTongue: true`)
 * using the same `findStylesToMatch` helper `parse.ts` itself uses.
 */

import fs from "fs";
import os from "os";
import path from "path";
import libxmljs2 from "libxmljs2";
import { unzip, unlinkRecursive } from "../../core/util/fsUtils";
import parse, { findStylesToMatch } from "./parse";
import { extractNamespaces } from "./mergeXml";
import { DocString, singleLanguageize } from "../../core/models/DocString";
import { calcLessonProgress } from "../../core/models/Language";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";

const SERVER_DOCS_DIR = path.join(process.cwd(), "test", "docs", "serverDocs");

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
    // Title text is split across runs in one fixture ("Lessons from" / "Luke")
    // and whole in the other ("Lessons from Luke") — assert the joined text
    // contains the expected title rather than pinning run-splitting.
    expect(texts.join(" ")).toContain("Lessons from");
    expect(texts.join(" ")).toContain("Luke");
  });

  test("classifies every extracted bare cover-style string as motherTongue: true", () => {
    expect(extracted.length).toBeGreaterThan(0);
    for (const docStr of extracted) {
      expect(docStr.motherTongue).toBe(true);
    }
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

    test("reaches 100% only when every intended motherTongue string is translated", () => {
      const lessonStrings = toLessonStrings(extracted);
      const allTranslated: TString[] = lessonStrings.map((lStr) => ({
        masterId: lStr.masterId,
        languageId: 2,
        text: `translated-${lStr.masterId}`,
        history: [],
      }));

      const fullProgress = calcLessonProgress(true, lessonStrings, allTranslated);
      expect(fullProgress.progress).toBe(100);

      const missingOne = allTranslated.slice(0, -1);
      const partialProgress = calcLessonProgress(true, lessonStrings, missingOne);
      expect(partialProgress.progress).toBeLessThan(100);
    });

    test("the motherTongue denominator equals the full extracted-string count (flag does not inflate/deflate completeness)", () => {
      const lessonStrings = toLessonStrings(extracted);
      // Every extracted cover string classified motherTongue: true above, so
      // filtering by motherTongue must not drop any of them from the
      // denominator (a mis-classification would silently shrink or pad it).
      const mtOnlyCount = lessonStrings.filter((lStr) => lStr.motherTongue).length;
      expect(mtOnlyCount).toBe(lessonStrings.length);

      const noneTranslated: TString[] = [];
      const zeroProgress = calcLessonProgress(true, lessonStrings, noneTranslated);
      expect(zeroProgress.progress).toBe(0);
    });
  });

  // --- Consumer 3: singleLanguageize monolingual output ---------------------

  describe("singleLanguageize monolingual output (DocString.ts)", () => {
    test("a standalone motherTongue string with no majority-language sibling is never blanked (no suppress-queue pollution)", () => {
      // Every extracted cover string is motherTongue: true with no majority-
      // language sibling in the same document — assign each a unique
      // masterId (mirroring a fresh, un-paired upload) and assert none of
      // them get suppressed by an unrelated later match.
      const lessonStrings: LessonString[] = extracted.map((docStr, i) => ({
        lessonStringId: i + 1,
        masterId: i + 1,
        lessonId: 97,
        lessonVersion: 1,
        type: "content",
        xpath: docStr.xpath,
        motherTongue: docStr.motherTongue,
      }));

      const result = singleLanguageize(lessonStrings, extracted);

      expect(result).toHaveLength(extracted.length);
      result.forEach((docStr, i) => {
        expect(docStr.text).toBe(extracted[i].text);
      });
    });
  });
});
