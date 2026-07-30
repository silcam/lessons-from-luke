import fs from "fs";
import libxmljs2, { Element } from "libxmljs2";
import parse, { findStylesToMatch } from "./parse";
import { extractNamespaces } from "./mergeXml";
import docStorage from "../storage/docStorage";
import { canAutoTranslate } from "../actions/defaultTranslations";

/**
 * Corpus-extraction regression guard for US2 (spec.md SC-003, SC-006, FR-005).
 *
 * This test derives its benchmark reference set by *extraction* from the
 * Q1-Q4 English Teacher's Guide corpus at test time (test/docs/serverDocs) —
 * it never hardcodes a count. It:
 *
 *  1. Globs every .odt in test/docs/serverDocs/.
 *  2. Parses each into DocStrings via the existing `parse()`.
 *  3. Resolves each DocString's enclosing paragraph style (walking the
 *     automatic-style parent-style-name chain, exactly as parse.ts does)
 *     to determine whether it sits under one of the four reference-bearing
 *     styles named in spec.md's "Reference-bearing style" key entity.
 *  4. Extracts the benchmark: DocStrings under a reference-bearing style
 *     whose trimmed text matches the numeric verse-reference range shape.
 *  5. Asserts every benchmark master is recognized by `canAutoTranslate`.
 *  6. Asserts recognition produces zero false positives: no numeric-range-
 *     shaped text appears as its own master *outside* a reference-bearing
 *     style anywhere in the corpus.
 *  7. Asserts prose masters with an embedded reference (a letter alongside
 *     a chapter:verse substring, e.g. "Luke 1:13 But the angel said...")
 *     are never recognized as auto-translatable.
 */

// Duplicated from canAutoTranslate's verseRangePattern (src/server/actions/defaultTranslations.ts)
// so the benchmark extraction is independent of the implementation under test.
const verseRangePattern = /^\d+:\d+\s*[-–]\s*\d+(?::\d+)?$/;

// The four reference-bearing paragraph styles named in spec.md's
// "Reference-bearing style" key entity (011-verse-reference-auto-population).
const REFERENCE_BEARING_BASE_STYLES = [
  "M.T._20_Text_20_-_20_Lesson_20_Title_20_Scrip_20_Reference",
  "Sub-Head_20_1",
  "M.T._20_Table_20_of_20_Contents",
  "Lesson_20_Title_20_Scrip_20_Reference",
];

function docsDirPath() {
  return `${process.cwd()}/test/docs/serverDocs`;
}

function odtFixtures(): string[] {
  return fs
    .readdirSync(docsDirPath())
    .filter((name) => name.endsWith(".odt"))
    .map((name) => `${docsDirPath()}/${name}`);
}

function paragraphStyleName(xmlDoc: libxmljs2.Document, ns: Record<string, string>, xpath: string) {
  let node: Element | null = xmlDoc.get(xpath, ns) as Element | null;
  while (node && node.type && node.type() === "text") {
    node = node.parent() as Element | null;
  }
  while (node && node.name() !== "p" && node.name() !== "h") {
    node = node.parent() as Element | null;
  }
  if (!node) return undefined;
  const attr = node.attr("style-name");
  return attr ? attr.value() : undefined;
}

function referenceBearingStyleNames(xmlDoc: libxmljs2.Document, ns: Record<string, string>) {
  const styleNames = new Set<string>();
  for (const base of REFERENCE_BEARING_BASE_STYLES) {
    styleNames.add(base);
    for (const resolved of findStylesToMatch(xmlDoc, ns, base)) {
      styleNames.add(resolved);
    }
  }
  return styleNames;
}

describe("Corpus-wide verse-reference recognition (US2)", () => {
  const fixtures = odtFixtures();

  // Sanity: this test is only meaningful if the corpus is actually present.
  it("finds fixture ODTs to analyze", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it("recognizes every extracted standalone numeric-reference master, with zero false positives and zero prose affected, across the whole corpus", () => {
    let benchmarkCount = 0;
    let falsePositiveCount = 0;

    for (const odtPath of fixtures) {
      const xmls = docStorage.docXml(odtPath);
      const docStrings = parse(xmls.content, "content");
      const xmlDoc = libxmljs2.parseXml(xmls.content);
      const ns = extractNamespaces(xmlDoc);
      const refStyles = referenceBearingStyleNames(xmlDoc, ns);

      for (const docString of docStrings) {
        const trimmed = docString.text.trim();
        const isVerseRangeShaped = verseRangePattern.test(trimmed);
        if (!isVerseRangeShaped) continue;

        const styleName = paragraphStyleName(xmlDoc, ns, docString.xpath);
        const isReferenceBearing = !!styleName && refStyles.has(styleName);

        if (isReferenceBearing) {
          // Extraction-derived benchmark: a real scripture reference.
          benchmarkCount += 1;
          expect(canAutoTranslate(docString.text)).toBe(true);
        } else {
          // A numeric-range-shaped master outside every known
          // reference-bearing style would be a false positive.
          falsePositiveCount += 1;
        }
      }
    }

    // The benchmark set must be non-trivial — otherwise this test would
    // vacuously pass without exercising real corpus data.
    expect(benchmarkCount).toBeGreaterThan(0);
    expect(falsePositiveCount).toBe(0);
  });

  it("never auto-populates prose that embeds a reference (FR-005)", () => {
    // A prose master with an embedded reference: letters alongside a
    // chapter:verse substring (e.g. "Luke 1:13 But the angel said...").
    const embeddedReferencePattern = /[A-Za-z].*\d+:\d+|\d+:\d+.*[A-Za-z]/;

    let proseWithEmbeddedReferenceCount = 0;

    for (const odtPath of fixtures) {
      const xmls = docStorage.docXml(odtPath);
      const docStrings = parse(xmls.content, "content");

      for (const docString of docStrings) {
        const trimmed = docString.text.trim();
        if (embeddedReferencePattern.test(trimmed)) {
          proseWithEmbeddedReferenceCount += 1;
          expect(canAutoTranslate(docString.text)).toBe(false);
        }
      }
    }

    // Sanity: the corpus does contain such prose (e.g. narrative text
    // quoting "Luke 1:13 ..."), so this assertion is not vacuous.
    expect(proseWithEmbeddedReferenceCount).toBeGreaterThan(0);
  });
});
