/// <reference types="jest" />

/**
 * assembleQuarter.integration.test.ts — golden-reference integration test
 * for the real `soffice` merge (US1). Opt-in, `yarn test:integration` only
 * (real soffice, serialized). See specs/007-assembled-quarter-download/
 * plan.md "Golden-reference check (FR-003/FR-004)" for the five parity axes
 * this asserts, and its Pass-6 note (fencing the Pass-5 CRITICAL) for the
 * MANDATORY source-immutability guard.
 *
 * Fixtures: the 14 real English masters for series 2
 * (`test/docs/serverDocs/Luke-2-{14..26,99}v01.odt`) — the TOC (`-99`) +
 * the 13 ascending lessons. Assembled with English mother-tongue +
 * English majority, which fires `makeLessonFile.ts:15`'s short-circuit and
 * hands `assembleQuarter` the RAW ADMIN-UPLOADED SOURCE `.odt` for every
 * constituent (not a tmp copy) — precisely the golden-reference case Pass 5
 * flagged as CRITICAL. Treat these fixtures as strictly read-only inputs.
 */

import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import libxmljs2, { Element } from "libxmljs2";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { Lesson, TOC_LESSON, COVER_A4_LESSON, COVER_A3_LESSON } from "../../core/models/Lesson";
import {
  expectedLessonNumbers,
  isCompleteQuarter,
  missingQuarterParts,
} from "../../core/models/Quarter";
import assembleQuarter from "./assembleQuarter";
import parse from "../xml/parse";
import docStorage from "../storage/docStorage";
import { TString } from "../../core/models/TString";
import { LessonString } from "../../core/models/LessonString";
import { objKeys } from "../../core/util/objectUtils";
import { selectAssemblyConstituents } from "../assembly/selectAssemblyConstituents";
import * as quarterStylesTemplate from "../assembly/quarterStylesTemplate";
import { PDF_CONVERT_TO_TARGET, classifyPage, reconcilePdfPages } from "./pdfRenderOptions";
import { assertLibreOfficeSupported } from "../util/libreOfficeVersion";

// The real merge (~14 `soffice` inserts + a `--convert-to pdf` verification
// pass) comfortably exceeds Jest's 5s default. `sofficeAssemble`'s own hard
// timeout is 100s; give the whole test generous headroom beyond that.
jest.setTimeout(280_000);

const BOOK = "Luke";
const SERIES = 2;
const LESSON_NUMBERS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
/** TOC first, then the 13 lessons ascending — the contractual assembly order. */
const ORDERED_LESSON_NUMBERS = [TOC_LESSON, ...LESSON_NUMBERS];

/**
 * The directory `makeLessonFile` actually reads constituents from
 * (`docStorage.docFilepath()`, i.e. `docStorage.docsDirPath()`) — NOT a
 * hardcoded tracked-fixtures path. Under NODE_ENV=test, docStorage.docsDirPath()
 * resolves to the seeded disposable copy the test run works against, so
 * hashing sources from here (the Pass-6 source-immutability guard's
 * `sourcePathFor`) hashes the exact files handed to assembleQuarter.
 */
const SERVER_DOCS_DIR = docStorage.docsDirPath();

/**
 * Each lesson's own level-1 heading text — what `text:chapter[display="name"]`
 * resolves to in the merged book's content footer
 * (contracts/template-application.md §4 "Per-lesson content footers
 * resolve"). Used both to assert that field is non-blank/per-lesson and to
 * assert the TOC's own listing carries every lesson in ascending order.
 * Confirmed against each fixture's own real `content.xml` heading text — NOT
 * `dc:subject`, which diverges for the two review lessons (20 and 26: their
 * own real heading is the generic "Review Lesson", not their `dc:subject`
 * "Lessons 14-19"/"Lessons 21-25" — which, notably, coincides with the
 * template asset's own stale-cached chapter-name value for THOSE two
 * lessons specifically, so this field can't discriminate real-vs-cached for
 * 20/26; it still must assert non-blank/present).
 */
const LESSON_TITLES: Record<number, string> = {
  14: "The Twelve Apostles",
  15: "True Disciples of Jesus Love Their Enemies",
  16: "A True Disciple of Jesus is Generous",
  17: "A True Disciple of Jesus Bears Good Fruit",
  18: "The Wise Man and the Foolish Man",
  19: "Jesus Heals the Centurion's Servant",
  20: "Review Lesson",
  21: "A Woman Wipes Jesus' Feet",
  22: "The Seed and the Sower",
  23: "The Lamp on a Stand",
  24: "Jesus Calms a Storm",
  25: "Jesus Casts out Demons into Pigs",
  26: "Review Lesson",
};

/**
 * The per-lesson-unique rendered footer text (e.g. `"Quarter 2 Lesson 14"`).
 * The Quarter value renders from the live `text:user-defined[Quarter]` field
 * (resolved against the `finalizeAssembledQuarter`-written book metadata) and
 * the Lesson value from the live `text:chapter` number field
 * `prepareConstituentForAssembly` chapterized (resolved positionally from
 * each lesson's level-1 outline heading) — rendered text identical to the
 * old pre-merge literal flattening. Used as BOTH the content/ordering marker
 * (it only appears within that lesson's own body pages, never as a
 * review-list entry) and the presence/regression marker (empirically
 * confirmed absent from the TOC's own "Quarter 2 Table of Contents" listing,
 * which repeats every lesson's title/truth/story TEXT but never its footer).
 * Deliberately NOT `dc:subject` (each lesson's title, e.g. "The Twelve
 * Apostles"): the real TOC constituent is a genuine Table of Contents that
 * lists every lesson's own title as a REVIEW ENTRY on its own pages —
 * confirmed against the real merge output — so a title-text marker's first
 * occurrence in the merged book is on the TOC's OWN pages, not that lesson's
 * real content pages, making it useless for ordering/first-page checks.
 */
function footerMarkerFor(lessonNumber: number): string {
  return `Quarter ${SERIES} Lesson ${lessonNumber}`;
}
/** The TOC's own unmistakable anchor — its actual "Table of Contents" heading, not any lesson's own title (which the TOC also lists). */
const TOC_MARKER = `Quarter ${SERIES} Table of Contents`;

/**
 * A single-token substring of the stand-alone lesson `First Page` footer's CC
 * license text (`"This work is licensed under the Creative Commons
 * Attribution-NonCommercial-ShareAlike 4.0 International License. To view a
 * copy of this license, visit http://creativecommons.org/licenses/…"` —
 * confirmed verbatim in a real constituent's `styles.xml`). The bare license
 * URL host+path segment is used rather than the full prose sentence because
 * it is a single unbroken token, immune to any `pdftotext -layout` line
 * wrapping the longer sentence could suffer.
 */
const CC_FOOTER_MARKER = "creativecommons.org/licenses";

function zeroPad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Mirrors `docStorage.docFilepath` for series-2 fixtures (version 01 for all 14). */
function sourcePathFor(lessonNumber: number): string {
  return path.join(SERVER_DOCS_DIR, `${BOOK}-${SERIES}-${zeroPad2(lessonNumber)}v01.odt`);
}

function lesson(lessonNumber: number): Lesson {
  return {
    lessonId: lessonNumber,
    book: BOOK,
    series: SERIES,
    lesson: lessonNumber,
    version: 1,
    lessonStrings: [],
  };
}

const motherLang: Language = {
  languageId: ENGLISH_ID,
  name: "English",
  code: "en",
  motherTongue: true,
  progress: [],
  archived: false,
  defaultSrcLang: 0,
};

/** English+English never touches `storage` (short-circuits in `makeLessonFile`) — an empty stub suffices. */
const storage = {} as Persistence;

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function convertToPdf(odtPath: string, workDir: string, profileDir: string): string {
  const outDir = path.join(workDir, "pdf-out");
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync(
    "soffice",
    [
      "--headless",
      "--norestore",
      "--nologo",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      PDF_CONVERT_TO_TARGET,
      "--outdir",
      outDir,
      odtPath,
    ],
    { timeout: 120_000 }
  );
  const pdfPath = path.join(outDir, `${path.basename(odtPath, ".odt")}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`soffice --convert-to pdf did not produce ${pdfPath}`);
  }
  return pdfPath;
}

function pdfPageCount(pdfPath: string): number {
  const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const match = /^Pages:\s+(\d+)/m.exec(out);
  if (!match) throw new Error(`pdfinfo produced no Pages: line for ${pdfPath}`);
  return parseInt(match[1], 10);
}

function pdfToText(pdfPath: string): string {
  return execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
}

/** Per-page text, split on the `\f` form-feed `pdftotext` emits between pages. */
function pagesOf(fullText: string): string[] {
  return fullText.split("\f");
}

/**
 * Locates a lesson's first CONTENT page (not merely the first page carrying
 * its footer marker) by requiring the page classifier's `"lesson-content"`
 * class in addition to the marker (contract §3 page-class signature table).
 * A raw `pageText.includes(marker)` scan is wrong when a coloring page
 * (which also carries the marker, printed twice, with no page number)
 * precedes the lesson's actual first numbered content page.
 */
function firstContentPageIndexFor(pages: string[], marker: string): number {
  return pages.findIndex(
    (pageText) => pageText.includes(marker) && classifyPage(pageText) === "lesson-content"
  );
}

/** Extracts and reads `styles.xml` from the assembled book into a fresh subdir of `workDir` — shared by the styles/outline assertions below, each of which needs its own extraction target to avoid clobbering a concurrently-running unzip. */
function extractStylesXml(outputPath: string, workDir: string, subdir: string): string {
  const extractDir = path.join(workDir, subdir);
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", outputPath, "styles.xml", "-d", extractDir]);
  return fs.readFileSync(path.join(extractDir, "styles.xml"), "utf8");
}

/** Extracts and reads `content.xml` from the assembled book into a fresh subdir of `workDir` — parallel to `extractStylesXml`, for content-side style-reference assertions. */
function extractContentXml(outputPath: string, workDir: string, subdir: string): string {
  const extractDir = path.join(workDir, subdir);
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", outputPath, "content.xml", "-d", extractDir]);
  return fs.readFileSync(path.join(extractDir, "content.xml"), "utf8");
}

/**
 * The four ODT-encoded `M.T.` paragraph-style names the monolingual restyle
 * rewrites to their plain counterparts (the monolingual template deliberately
 * omits these styles, so any surviving REFERENCE keeps stale constituent
 * formatting — the verified 0.6 cm Lesson Title spacing defect). Only
 * references (`text:style-name`/`style:parent-style-name`) are renamed;
 * `style:name` DEFINITIONS may legitimately survive unreferenced.
 */
const MONOLINGUAL_RESTYLED_MT_NAMES = [
  "M.T._20_Lesson_20_Title",
  "M.T._20_Lesson_20_title_20_-_20_invisible",
  "M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse",
  "M.T._20_Coloring_20_Page_20_-_20_Truth",
] as const;

/**
 * Extracts the full `<style:master-page>` element carrying the given
 * `style:display-name` (e.g. `"First Page"`) from a `styles.xml` string, or
 * `undefined` if no master page with that display name exists.
 */
const ODF_NAMESPACES = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  text: "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
};

/**
 * The assembled book's visible lesson openings (014 WS2): every level-1
 * `text:h` in `office:body` (`text:outline-level` "1" or absent), excluding
 * the pipeline's injected hidden headings (automatic style with
 * `text:display="none"`), paired with its content.xml automatic style (or
 * undefined for a common named style).
 */
function visibleLessonOpenings(
  contentDoc: ReturnType<typeof libxmljs2.parseXml>
): { heading: Element; autoStyle: Element | undefined }[] {
  return contentDoc
    .find<Element>("//office:body//text:h", ODF_NAMESPACES)
    .filter((heading) => {
      const level = heading.attr("outline-level");
      return !level || level.value() === "1";
    })
    .map((heading) => {
      const styleName = heading.attr("style-name")?.value();
      const autoStyle = styleName
        ? (contentDoc.get<Element>(
            `//office:automatic-styles/style:style[@style:name='${styleName}']`,
            ODF_NAMESPACES
          ) ?? undefined)
        : undefined;
      return { heading, autoStyle };
    })
    .filter(
      ({ autoStyle }) =>
        autoStyle
          ?.get<Element>("style:text-properties", ODF_NAMESPACES)
          ?.attr("display")
          ?.value() !== "none"
    );
}

/**
 * The 018 sacrificial terminal paragraph's marker TEXT. Deliberately a LOCAL
 * literal rather than an import from `prepareConstituentForAssembly`: this
 * suite's job is to assert the DELIVERED book carries no such paragraph, and
 * an imported constant would silently follow a rename.
 * `prepareConstituentForAssembly.test.ts` pins the exported constant to this
 * same literal, so the two can never drift apart unnoticed.
 */
const SACRIFICIAL_MARKER_TEXT = "QuarterAssemblySacrificialTail";

/** Matches both memory-verse style-naming families (`Coloring Page - Memory Verse` and the `M.T.`-prefixed one). */
const MEMORY_VERSE_STYLE_PATTERN = /Memory_20_Verse$/;

/**
 * Matches the coloring page's empty graphic-number spacer style — in every
 * series-2 constituent the paragraph immediately PRECEDING the final memory
 * verse, and therefore the style the 018 defect propagates onto that verse
 * (`insertDocumentFromURL` strips the inserted document's last body
 * paragraph's own style and gives it the preceding paragraph's).
 */
const GRAPHIC_NUMBER_STYLE_PATTERN = /Graphic_20_Number$/;

/**
 * Resolves a paragraph's `text:style-name` through the document's own
 * content.xml automatic-style parent chain to the NAMED style it ultimately
 * inherits from. Style assertions must not care whether a paragraph names
 * its style directly or reaches it via a `P<n>` automatic style — the merge
 * renumbers those arbitrarily, and `prepareConstituentForAssembly`'s
 * memory-verse flattening deliberately converts some of the second form into
 * the first.
 */
function namedStyleResolverFor(
  contentDoc: ReturnType<typeof libxmljs2.parseXml>
): (styleName: string) => string {
  const parents = new Map<string, string | undefined>();
  contentDoc
    .find<Element>(
      "//office:automatic-styles/style:style[@style:family='paragraph']",
      ODF_NAMESPACES
    )
    .forEach((style) => {
      const name = style.attr("name")?.value();
      if (name) parents.set(name, style.attr("parent-style-name")?.value() ?? undefined);
    });
  return (styleName: string): string => {
    const seen = new Set<string>();
    let current: string | undefined = styleName;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (!parents.has(current)) return current;
      current = parents.get(current);
    }
    return current ?? styleName;
  };
}

/** Every styled `text:p` in `office:body`, paired with its trimmed text and its chain-resolved NAMED style. */
function styledParagraphs(
  contentDoc: ReturnType<typeof libxmljs2.parseXml>
): { text: string; namedStyle: string }[] {
  const resolve = namedStyleResolverFor(contentDoc);
  return contentDoc
    .find<Element>("//office:body//text:p[@text:style-name]", ODF_NAMESPACES)
    .map((p) => ({ text: p.text().trim(), namedStyle: resolve(p.attr("style-name")!.value()) }));
}

/**
 * One entry per source constituent whose FINAL `office:text` body paragraph
 * is memory-verse styled — the exact paragraph the 018 defect victimizes
 * (verified: 11 of the 14 series-2 constituents; the TOC and the two review
 * lessons end on other content and are unaffected).
 *
 * `memoryVerseCount` is derived by reading the READ-ONLY source fixtures,
 * never hardcoded: the number of memory-verse-styled paragraphs carrying
 * that exact verse text across the WHOLE corpus. The assembled book must
 * preserve it. It matters that the count is corpus-wide rather than
 * per-lesson — each memory verse's TEXT also appears several times in its
 * own lesson's body and in the next lesson's review section, under ordinary
 * text styles, so a naive "every paragraph with this text is memory-verse
 * styled" assertion would be false both before and after the fix.
 */
interface TerminalMemoryVerseExpectation {
  lessonNumber: number;
  verse: string;
  memoryVerseCount: number;
}

function terminalMemoryVerseExpectations(workDir: string): TerminalMemoryVerseExpectation[] {
  const sourceDocs = ORDERED_LESSON_NUMBERS.map((lessonNumber) => {
    const extractDir = path.join(workDir, `source-content-${lessonNumber}`);
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", [
      "-o",
      "-q",
      sourcePathFor(lessonNumber),
      "content.xml",
      "-d",
      extractDir,
    ]);
    const contentDoc = libxmljs2.parseXml(
      fs.readFileSync(path.join(extractDir, "content.xml"), "utf8")
    );
    return { lessonNumber, contentDoc, paragraphs: styledParagraphs(contentDoc) };
  });

  const expectations: TerminalMemoryVerseExpectation[] = [];
  sourceDocs.forEach(({ lessonNumber, contentDoc }) => {
    const officeText = contentDoc.get<Element>("//office:body/office:text", ODF_NAMESPACES);
    const children = officeText!.childNodes().filter((node) => node.type() === "element");
    const last = children[children.length - 1] as Element;
    const styleName = last.attr("style-name")?.value();
    if (last.name() !== "p" || !styleName) return;
    if (!MEMORY_VERSE_STYLE_PATTERN.test(namedStyleResolverFor(contentDoc)(styleName))) return;
    const verse = last.text().trim();
    const memoryVerseCount = sourceDocs.reduce(
      (total, source) =>
        total +
        source.paragraphs.filter(
          (p) => p.text === verse && MEMORY_VERSE_STYLE_PATTERN.test(p.namedStyle)
        ).length,
      0
    );
    expectations.push({ lessonNumber, verse, memoryVerseCount });
  });
  return expectations;
}

function masterPageBlock(stylesXml: string, displayName: string): string | undefined {
  // A master-page with no children (e.g. a footer-less "First Page") is
  // self-closing (`.../>`); one with children is a container closed by a
  // real `</style:master-page>` tag. Match either form so the block ends at
  // ITS OWN close, not the next master-page's.
  return new RegExp(
    `<style:master-page[^>]*style:display-name="${displayName}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/style:master-page>)`
  ).exec(stylesXml)?.[0];
}

/**
 * Extracts the `M.T. Text` paragraph style's `fo:background-color` value from
 * a `styles.xml` string. Returns `undefined` if the style or the attribute is
 * absent (a template that never sets it, vs. one that sets it to
 * `"transparent"`, which returns the literal string `"transparent"`).
 */
function mtTextBackgroundColor(stylesXml: string): string | undefined {
  const mtTextStyle = /<style:style style:name="M\.T\._20_Text"[^>]*>[\s\S]*?<\/style:style>/.exec(
    stylesXml
  )?.[0];
  if (!mtTextStyle) return undefined;
  return /fo:background-color="([^"]*)"/.exec(mtTextStyle)?.[1];
}

/**
 * Builds a test-only style-source fixture `.odt`: a byte-for-byte copy of the
 * real shipped `assets/quarter-styles-template.odt` (never mutated itself)
 * with its `M.T. Text` paragraph style's `fo:background-color` patched to a
 * distinguishing marker color. Used to prove per-job re-read (US3/FR-005):
 * two jobs pointed at two fixtures built this way must carry visibly
 * different resolved `M.T.*` style properties in their own assembled output.
 */
function buildStyleSourceFixture(workDir: string, name: string, backgroundColor: string): string {
  const fixturePath = path.join(workDir, `${name}.odt`);
  fs.copyFileSync(path.join(process.cwd(), "assets", "quarter-styles-template.odt"), fixturePath);

  const extractDir = path.join(workDir, `${name}-extract`);
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", fixturePath, "styles.xml", "-d", extractDir]);
  const stylesPath = path.join(extractDir, "styles.xml");
  const original = fs.readFileSync(stylesPath, "utf8");
  const patched = original.replace(
    /(<style:style style:name="M\.T\._20_Text"[^>]*>[\s\S]*?<style:paragraph-properties[^>]*fo:background-color=")[^"]*(")/,
    `$1${backgroundColor}$2`
  );
  if (patched === original) {
    throw new Error(
      "buildStyleSourceFixture: failed to patch the M.T. Text style's fo:background-color — fixture builder is out of sync with the real asset's styles.xml shape"
    );
  }
  fs.writeFileSync(stylesPath, patched, "utf8");
  // Update the existing styles.xml entry in place (not a full rebuild) —
  // preserves every other entry (incl. the required-uncompressed `mimetype`
  // entry) byte-for-byte.
  execFileSync("zip", ["-q", fixturePath, "styles.xml"], { cwd: extractDir });

  return fixturePath;
}

/** The printed page-number footer token on a page, e.g. `"14"` from `"...  Page 14"`, or `undefined` if the page carries no page-number footer (front matter's own first page, and every lesson's own first page — FR-003 suppression). */
function pageNumberFooterOn(pageText: string): string | undefined {
  const matches = [...pageText.matchAll(/\bPage\s+(\S+)/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : undefined;
}

/**
 * Reconciles a rendered book's `pdftotext` extraction against `pdfinfo`'s
 * authoritative page count (F2b's render oracle, contract §3) — the shared
 * helper every FR-016 absolute-assertion test in this file uses instead of
 * the raw, unreconciled {@link pagesOf} split.
 */
function reconciledPagesFor(outputPath: string, workDir: string, fullText: string): string[] {
  const pdfPath = path.join(workDir, "pdf-out", `${path.basename(outputPath, ".odt")}.pdf`);
  const physicalPageCount = pdfPageCount(pdfPath);
  return reconcilePdfPages(fullText, physicalPageCount);
}

/**
 * Walks a book's (or a body sub-range's) reconciled, oracle-classified pages
 * in physical order and asserts the FR-016 absolute invariant directly: a
 * running body-position counter advances by exactly one for EVERY page that
 * belongs to the body/lesson sequence — "lesson-title" (a lesson's own
 * suppressed first page) and "coloring" (Coloring_20_Page's footer carries
 * the Quarter/Lesson marker twice and no page-number field, so it silently
 * consumes a slot — the exact class the task description calls out by name)
 * consume a slot and print NOTHING; "lesson-content" consumes a slot and
 * prints exactly that running position, as a string. This is derived purely
 * from each page's own oracle classification, never from the PREVIOUS
 * page's printed value — the load-bearing difference from the older
 * relative "adjacent numbered pages increment by 1" check, which the task
 * description notes would pass even under a uniformly-shifted defect this
 * feature exists to fix.
 *
 * @returns the last body position that was actually printed (the position
 * the book's final content page prints), so callers can assert it against
 * an independently-derived expectation.
 */
function assertAbsoluteBodySequence(pages: string[]): number {
  let runningPosition = 0;
  let lastPrintedPosition: number | undefined;
  pages.forEach((pageText, index) => {
    const pageClass = classifyPage(pageText);
    const printed = pageNumberFooterOn(pageText);
    if (pageClass === "lesson-title" || pageClass === "coloring") {
      runningPosition++;
      expect({ index, pageClass, printed }).toEqual({
        index,
        pageClass,
        printed: undefined,
      });
    } else if (pageClass === "lesson-content") {
      runningPosition++;
      expect({ index, pageClass, printed }).toEqual({
        index,
        pageClass,
        printed: String(runningPosition),
      });
      lastPrintedPosition = runningPosition;
    }
  });
  expect(lastPrintedPosition).toBeDefined();
  return lastPrintedPosition!;
}

describe("assembleQuarter (real soffice merge, golden-reference parity)", () => {
  let workDir: string;
  let workRoot: string;
  let jobId: string;
  let outputPath: string;
  let sourceHashesBefore: Map<number, string>;
  let fullText: string;
  let pages: string[];

  beforeAll(async () => {
    // Confirm the external toolchain this test depends on is actually
    // present BEFORE doing any work, so a missing dependency fails loudly
    // and immediately rather than mid-merge.
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    execFileSync("pdftotext", ["-v"]);
    execFileSync("pdfinfo", ["-v"]);

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-integration-"));
    workRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(workRoot, { recursive: true });
    jobId = "golden-reference";
    fs.mkdirSync(path.join(workRoot, jobId), { recursive: true });

    // --- Pass-6 source-immutability guard (MANDATORY, fences the Pass-5
    // CRITICAL): hash every source constituent BEFORE assembly. English+
    // English fires `makeLessonFile.ts:15`'s short-circuit, so `assembleQuarter`
    // is handed these exact RAW files, not tmp copies — the one path where
    // an in-place mutation would destroy non-recoverable admin-uploaded data.
    sourceHashesBefore = new Map();
    ORDERED_LESSON_NUMBERS.forEach((n) => {
      const srcPath = sourcePathFor(n);
      expect(fs.existsSync(srcPath)).toBe(true);
      sourceHashesBefore.set(n, sha256(srcPath));
    });

    // --- The real merge. Unmocked makeLessonFile/prepareConstituentForAssembly/
    // sofficeAssemble/finalizeAssembledQuarter — the actual production path.
    outputPath = await assembleQuarter({
      storage,
      lessons: ORDERED_LESSON_NUMBERS.map(lesson),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId,
      workRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    // --- PDF render + pdftotext, per plan.md's golden-reference check
    // ("extracted via PDF render + pdftotext, not a byte-for-byte ODT diff").
    const profileDir = path.join(workDir, "pdf-profile");
    const pdfPath = convertToPdf(outputPath, workDir, profileDir);
    fullText = pdfToText(pdfPath);
    pages = pagesOf(fullText);
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    // `assembleQuarter` deletes its own job dir and retains the result in
    // docStorage's tmp dir (`docStorage.docsDirPath() + "/tmp"`, the seeded
    // disposable run dir under NODE_ENV=test) — outside workDir, so unlink it
    // explicitly rather than accumulating one assembled book per jest run.
    if (outputPath) fs.rmSync(outputPath, { force: true });
  });

  test("source-immutability guard (Pass 6, MANDATORY): every constituent source is byte-identical after assembly", () => {
    ORDERED_LESSON_NUMBERS.forEach((n) => {
      const srcPath = sourcePathFor(n);
      expect(fs.existsSync(srcPath)).toBe(true);
      expect(sha256(srcPath)).toBe(sourceHashesBefore.get(n));
    });
  });

  test("017 FR-004/SC-005, INV-1 (bilingual): the assembled book's styles.xml and content.xml carry zero text:page-adjust occurrences, even though the source corpus is entirely offset-carrying (30 occurrences across the 14 constituents, all on Front_20_matter)", () => {
    // The assertion that actually matters for SC-005 — the client inspects
    // the DELIVERED book, not the template asset. This corpus
    // (Luke-2-{14..26,99}v01) is itself offset-carrying, so this is a real
    // test of Module1.xba's loadStylesFromURL(OverwriteStyles=True) winning
    // over every constituent's own Front_20_matter definition, not a
    // tautology an asset-only assertion could pass while this still fails.
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-page-adjust");
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-page-adjust");

    expect(stylesXml).not.toContain("text:page-adjust");
    expect(contentXml).not.toContain("text:page-adjust");
  });

  test("content + lesson ordering: TOC first, then lessons 1-13 (14-26) ascending", () => {
    const tocIndex = fullText.indexOf(TOC_MARKER);
    expect(tocIndex).toBeGreaterThan(-1);

    let searchFrom = tocIndex;
    LESSON_NUMBERS.forEach((n) => {
      const marker = footerMarkerFor(n);
      const index = fullText.indexOf(marker, searchFrom);
      expect(index).toBeGreaterThan(searchFrom);
      searchFrom = index + marker.length;
    });
  });

  test("footer Quarter/Lesson values are populated per-lesson (the actual FR-004 defect this task fixes)", () => {
    // The bug this task fixes: EVERY lesson's footer showed the TOC's own
    // fallback ("Quarter 2 Lesson 99") because all 14 constituents' shared
    // master-page names collided on import. Assert the inverse of the bug
    // signature directly, plus that each of the 13 lessons' own distinct
    // value survives.
    expect(fullText).not.toContain("Lesson 99");
    LESSON_NUMBERS.forEach((n) => {
      const occurrences = fullText.split(`Quarter ${SERIES} Lesson ${n}`).length - 1;
      expect(occurrences).toBeGreaterThan(0);
    });
  });

  test("continuous page numbering: consecutive numbered pages increment by exactly 1", () => {
    // Compare PHYSICALLY ADJACENT pages only (not a filtered/compacted
    // sequence): a lesson's own suppressed title page legitimately consumes
    // one page-number slot without printing it, so the numbered page right
    // after a suppressed page correctly jumps by 2 — that gap is exactly
    // what the "first-page suppression" test below asserts, not a
    // continuity violation. Within any run of pages that DO both print a
    // number, the increment must be exactly 1.
    const tokens = pages.map(pageNumberFooterOn);
    const numericValues = tokens.map((token) =>
      token !== undefined && /^\d+$/.test(token) ? parseInt(token, 10) : undefined
    );

    let comparedAdjacentPairs = 0;
    for (let i = 1; i < numericValues.length; i++) {
      const prev = numericValues[i - 1];
      const curr = numericValues[i];
      if (prev === undefined || curr === undefined) continue;
      expect(curr).toBe(prev + 1);
      comparedAdjacentPairs++;
    }
    expect(comparedAdjacentPairs).toBeGreaterThan(0);
  });

  test("each lesson's first page suppresses its page number (FR-003)", () => {
    // Module1.xba forces every constituent onto a fresh page, so a lesson's
    // own first (title) page is exactly the page immediately BEFORE the
    // first page carrying its footer marker (its first numbered content
    // page) — confirmed against the real merge output.
    LESSON_NUMBERS.forEach((n) => {
      const marker = footerMarkerFor(n);
      const firstContentPageIndex = firstContentPageIndexFor(pages, marker);
      expect(firstContentPageIndex).toBeGreaterThan(0);

      const titlePageIndex = firstContentPageIndex - 1;
      expect(pageNumberFooterOn(pages[titlePageIndex])).toBeUndefined();
    });
  });

  test("FR-002: no lesson first page renders any footer content — the stand-alone CC license footer is gone (contracts/template-application.md §4)", () => {
    LESSON_NUMBERS.forEach((n) => {
      const marker = footerMarkerFor(n);
      const firstContentPageIndex = firstContentPageIndexFor(pages, marker);
      expect(firstContentPageIndex).toBeGreaterThan(0);

      const titlePageIndex = firstContentPageIndex - 1;
      expect(pages[titlePageIndex]).not.toContain(CC_FOOTER_MARKER);
    });
  });

  test("FR-002: the CC license text occurs only within the TOC section of the book, never on any lesson's own pages (contracts/template-application.md §4)", () => {
    // The TOC section is everything from the book's start up to (but not
    // including) the first lesson's own first (title) page — the same
    // boundary the "first page suppresses its page number" test above
    // computes for lesson 14, the quarter's first lesson.
    const firstLessonMarker = footerMarkerFor(LESSON_NUMBERS[0]);
    const firstLessonContentPageIndex = firstContentPageIndexFor(pages, firstLessonMarker);
    expect(firstLessonContentPageIndex).toBeGreaterThan(0);
    const firstLessonTitlePageIndex = firstLessonContentPageIndex - 1;

    const tocSectionPages = pages.slice(0, firstLessonTitlePageIndex);
    const lessonSectionPages = pages.slice(firstLessonTitlePageIndex);

    // The CC text genuinely appears somewhere in the TOC section...
    expect(tocSectionPages.some((pageText) => pageText.includes(CC_FOOTER_MARKER))).toBe(true);
    // ...and nowhere else in the book (no lesson page — first or content —
    // carries it).
    lessonSectionPages.forEach((pageText) => {
      expect(pageText).not.toContain(CC_FOOTER_MARKER);
    });
  });

  test("FR-002: the 'First Page' master page style has no <style:footer> element (contracts/template-application.md §4)", () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-first-page-footer");
    const firstPageMaster = masterPageBlock(stylesXml, "First Page");
    expect(firstPageMaster).toBeDefined();
    expect(firstPageMaster).not.toContain("<style:footer>");
  });

  test("single clean master-page set: every display name appears ONCE and none carries a numeric constituent suffix (the duplicated-page-styles defect this fix removes)", () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract");

    const masterPageTags = stylesXml.match(/<style:master-page [^>]*>/g) ?? [];
    expect(masterPageTags.length).toBeGreaterThan(0);

    const displayNames = masterPageTags.map(
      (tag) => /style:display-name="([^"]*)"/.exec(tag)?.[1] ?? /style:name="([^"]*)"/.exec(tag)![1]
    );
    // The exact defect signature: "Coloring Page 00".."Coloring Page 13".
    displayNames.forEach((name) => expect(name).not.toMatch(/ \d{2}$/));
    // One definition per display name — the template-compatible clean set.
    expect(new Set(displayNames).size).toBe(displayNames.length);
    // The client's key styles survived the merge under their ORIGINAL names.
    ["Coloring Page", "Lesson Content", "First Page"].forEach((expected) => {
      expect(displayNames.filter((name) => name === expected)).toHaveLength(1);
    });
  });

  test("footer chapter-number VALUES resolve correctly per lesson after template application (009 overwrite-scope discriminating guard, contracts/template-application.md §5): the actual per-lesson footer text must contain the lesson's own absolute number, not a stale/uniform value", () => {
    // Distinct from the outline start-value assertion below: that row only
    // asserts the level-1 outline STYLE's start-value survives, which would
    // still pass even if a heading's own chapter-number FIELD failed to
    // resolve (e.g. because template application dropped/renamed the
    // outline-derived numbering a heading's `text:chapter` field depends on).
    // This assertion walks each lesson's own first footer occurrence and
    // confirms the rendered VALUE is that lesson's own absolute number.
    LESSON_NUMBERS.forEach((n) => {
      const marker = footerMarkerFor(n);
      const index = fullText.indexOf(marker);
      expect(index).toBeGreaterThan(-1);
      // The rendered footer text must be exactly "Quarter <SERIES> Lesson <n>"
      // with no stray digits immediately trailing (which would indicate a
      // collided/misresolved chapter-number field, e.g. "Lesson 1499").
      const tail = fullText.slice(index + marker.length, index + marker.length + 1);
      expect(/\d/.test(tail)).toBe(false);
    });
  });

  test('M.T. Text paragraph style carries no legacy highlight after template application (009 FR-002/FR-003): `styles.xml`\'s `M.T. Text` style has no fo:background-color="#ffffcc"', () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-mt");

    const mtTextStyle =
      /<style:style style:name="M\.T\._20_Text"[^>]*>[\s\S]*?<\/style:style>/.exec(stylesXml)?.[0];
    expect(mtTextStyle).toBeDefined();
    expect(mtTextStyle).not.toContain('fo:background-color="#ffffcc"');
  });

  test("bilingual output is untouched by the monolingual restyle (014): assembled bilingual content.xml still references M.T. Lesson Title", () => {
    // The bilingual template DEFINES the M.T. styles, so bilingual assemblies
    // must keep their M.T. references byte-for-byte — the restyle is gated to
    // monolingual-template jobs only.
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-bilingual-mt");
    expect(contentXml).toContain('text:style-name="M.T._20_Lesson_20_Title"');
  });

  test("018 (bilingual): every constituent's FINAL coloring-page memory verse keeps a memory-verse paragraph style in the assembled book, and none is restyled to the preceding graphic-number spacer", () => {
    // The pinned 018 mechanism: `insertDocumentFromURL` strips the LAST body
    // paragraph of every inserted constituent of its own named style and
    // gives it the PRECEDING paragraph's. In every series-2 lesson that last
    // paragraph is the second coloring-page memory verse and its predecessor
    // is the empty graphic-number spacer, so the verse renders centered,
    // bold, italic and un-highlighted instead of in the memory-verse column.
    const contentDoc = libxmljs2.parseXml(
      extractContentXml(outputPath, workDir, "content-extract-018-memory-verse")
    );
    const paragraphs = styledParagraphs(contentDoc);
    const expectations = terminalMemoryVerseExpectations(workDir);
    // 11 of the 14 constituents end on a memory verse (all but the TOC and
    // the two review lessons) — a guard on the fixture reading itself, so a
    // silently-empty expectation set can never pass this test vacuously.
    expect(expectations).toHaveLength(11);

    expectations.forEach(({ lessonNumber, verse, memoryVerseCount }) => {
      const carrying = paragraphs.filter((p) => p.text === verse);
      expect({
        lessonNumber,
        memoryVerse: carrying.filter((p) => MEMORY_VERSE_STYLE_PATTERN.test(p.namedStyle)).length,
        graphicNumber: carrying.filter((p) => GRAPHIC_NUMBER_STYLE_PATTERN.test(p.namedStyle))
          .length,
      }).toEqual({ lessonNumber, memoryVerse: memoryVerseCount, graphicNumber: 0 });
    });
  });

  test("018 companion invariants (bilingual): no sacrificial marker paragraph survives into the delivered book or its render, and the book carries no EMPTY memory-verse paragraph", () => {
    // Guards the half-implemented states of the 018 fix rather than the
    // original defect: a sacrificial terminal paragraph that prepare appends
    // but finalize fails to strip would leave its marker text visible, and —
    // because the merge annihilates that paragraph's own hidden automatic
    // style and hands it the memory-verse style instead — an empty
    // memory-verse paragraph renders as a stray yellow highlighted band under
    // the final coloring-page verse. Neither shape exists in the source
    // corpus (verified: zero empty memory-verse paragraphs across all 14).
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-018-companions");
    expect(contentXml).not.toContain(SACRIFICIAL_MARKER_TEXT);
    expect(fullText).not.toContain(SACRIFICIAL_MARKER_TEXT);

    const emptyMemoryVerses = styledParagraphs(libxmljs2.parseXml(contentXml)).filter(
      (p) => p.text === "" && MEMORY_VERSE_STYLE_PATTERN.test(p.namedStyle)
    );
    expect(emptyMemoryVerses).toHaveLength(0);
  });

  test("lesson-opening master pages (014 WS2 regression guard, GREEN from birth — no committed fixture ships the Lesson-9 defect): every visible level-1 heading's automatic style carries master-page-name First_20_Page, and exactly 13 openings exist", () => {
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-master-pages");
    const openings = visibleLessonOpenings(libxmljs2.parseXml(contentXml));
    expect(openings).toHaveLength(LESSON_NUMBERS.length);
    openings.forEach(({ heading, autoStyle }) => {
      // Every opening must resolve to a content.xml automatic style pinned
      // to the First Page master (the canonical opening shape). Keyed by
      // heading text so a failure names the offending lesson.
      expect({
        heading: heading.text().trim(),
        master: autoStyle?.attr("master-page-name")?.value(),
      }).toEqual({ heading: heading.text().trim(), master: "First_20_Page" });
    });
  });

  test('017 US1-T3 FR-005/INV-3: the assembled book\'s FIRST visible level-1 opening carries the explicit style:page-number="1" body restart, and it is the ONLY LESSON-OPENING paragraph in the book that does', () => {
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-body-restart");
    const contentDoc = libxmljs2.parseXml(contentXml);
    const openings = visibleLessonOpenings(contentDoc);
    expect(openings).toHaveLength(LESSON_NUMBERS.length);

    const restartAttrOn = (style: Element | undefined) =>
      style
        ?.get<Element>("style:paragraph-properties", ODF_NAMESPACES)
        ?.attr("page-number")
        ?.value();

    // First opening (lesson 14) carries the explicit restart.
    expect(restartAttrOn(openings[0].autoStyle)).toBe("1");
    // Every LATER opening keeps auto-continuation, never a second restart.
    // Allows `undefined` (no attribute — the common shape) OR the literal
    // ODF value `"auto"` — some real constituents (verified: Luke-2-15's and
    // Luke-2-20's own "True Disciples of Jesus Love Their Enemies" openings)
    // already carry an explicit `style:page-number="auto"` in their raw
    // source, predating this feature; `"auto"` IS auto-continuation, so it
    // is not a competing restart. A stray explicit NUMBER (the actual INV-3
    // defect class) is still caught here, and by the book-wide count below.
    openings.slice(1).forEach(({ heading, autoStyle }) => {
      const restart = restartAttrOn(autoStyle);
      // Keyed by heading text so a failure names the offending lesson.
      expect({
        heading: heading.text().trim(),
        allowedRestart: [undefined, "auto"].includes(restart),
      }).toEqual({ heading: heading.text().trim(), allowedRestart: true });
    });

    // Book-wide: exactly TWO automatic styles anywhere carry the restart —
    // the body restart this test targets, AND US1-T6's own separate
    // front-matter anchor (contract §2.2's "Front-matter anchor (FR-016)",
    // asserted end-to-end by its own dedicated test, below) — never more,
    // and never fewer once both are wired.
    const allRestarts = contentDoc
      .find<Element>("//office:automatic-styles/style:style", ODF_NAMESPACES)
      .filter(
        (style) =>
          style
            .get<Element>("style:paragraph-properties", ODF_NAMESPACES)
            ?.attr("page-number")
            ?.value() === "1"
      );
    expect(allRestarts).toHaveLength(2);
  });

  /**
   * INV-6b (017 US1-T3, contract §2.5): footer rendering is a conjunction
   * across two XML levels — (1) the master carries a `<style:footer>`
   * element, AND (2) the page layout it references carries a POPULATED
   * `<style:footer-style>` (one with a `<style:header-footer-properties>`
   * child). LibreOffice emits an EMPTY `<style:footer-style/>` on every
   * switched-off layout, so testing footer-style presence alone is wrong —
   * it fails on the template itself. Resolved by MASTER NAME, never a
   * literal `Mpm<n>` (automatic layout names are only locally unique).
   * Uses an XML parser throughout — a regex spanning to the next master's
   * closing tag has produced false claims in prior red-team passes on these
   * assets, most of which are self-closing.
   */
  function masterRendersFooter(
    stylesDoc: ReturnType<typeof libxmljs2.parseXml>,
    masterName: string
  ): boolean {
    const master = stylesDoc.get<Element>(
      `//style:master-page[@style:name='${masterName}']`,
      ODF_NAMESPACES
    );
    expect(master).toBeDefined();
    const hasFooterElement = !!master!.get<Element>("style:footer", ODF_NAMESPACES);
    const layoutName = master!.attr("page-layout-name")?.value();
    expect(layoutName).toBeDefined();
    const layout = stylesDoc.get<Element>(
      `//style:page-layout[@style:name='${layoutName}']`,
      ODF_NAMESPACES
    );
    expect(layout).toBeDefined();
    const footerStyle = layout!.get<Element>("style:footer-style", ODF_NAMESPACES);
    const hasPopulatedFooterStyle = !!footerStyle?.get<Element>(
      "style:header-footer-properties",
      ODF_NAMESPACES
    );
    return hasFooterElement && hasPopulatedFooterStyle;
  }

  // GREEN from birth (same pattern as the master-pages regression guard
  // above): the merge already wins INV-6b via `loadStylesFromURL`'s
  // template-style overwrite (contract §2.5), so this conjunction already
  // holds on today's real corpus. It ships now as the regression guard the
  // spec requires — a future asset or merge regression that breaks EITHER
  // conjunct (e.g. reintroduces a populated footer-style on the layout
  // while the master itself stays footer-less) trips this, where the old
  // single-conjunct assertion at line ~540 would not.
  test("017 US1-T3 FR-007/FR-009, INV-6b: in the assembled book's styles.xml, First_20_Page and Standard render NO footer under the CONJUNCTION (no style:footer element AND no populated style:footer-style on the resolved layout) — both conjuncts asserted, resolved by master NAME not literal Mpm<n>", () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-footer-conjunction");
    const stylesDoc = libxmljs2.parseXml(stylesXml);

    ["First_20_Page", "Standard"].forEach((masterName) => {
      expect(masterRendersFooter(stylesDoc, masterName)).toBe(false);
    });
  });

  test("outline numbering: the merged book's level-1 outline style starts at the quarter's first absolute lesson number (14), so chapter-number footer fields render", () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-outline");

    const level1 = /<text:outline-level-style text:level="1"[^>]*>/.exec(stylesXml)?.[0];
    expect(level1).toBeDefined();
    expect(level1).toContain('style:num-format="1"');
    expect(level1).toContain(`text:start-value="${(SERIES - 1) * 13 + 1}"`);
  });

  test("outline / TOC listing: the TOC's own listing carries all 13 lessons, in correct ascending order (FR-005/SC-003, contracts/template-application.md §4)", () => {
    // The TOC constituent's own review-list page(s) list every lesson's
    // title (dc:subject) as a row — distinct from the footer/content-page
    // ordering the "content + lesson ordering" test above already checks.
    // Confirms the TOC listing itself carries all 13, in the right order.
    let searchFrom = fullText.indexOf(TOC_MARKER);
    expect(searchFrom).toBeGreaterThan(-1);
    LESSON_NUMBERS.forEach((n) => {
      const title = LESSON_TITLES[n];
      const index = fullText.indexOf(title, searchFrom);
      expect(index).toBeGreaterThan(searchFrom);
      searchFrom = index + title.length;
    });
  });

  test("per-lesson content footer fields resolve to non-blank, per-lesson values — text:chapter[name] and text:title/text:user-defined[Quarter] (contracts/template-application.md §4, RE-VERIFY + EXPAND)", () => {
    // text:chapter[name]: each lesson's own page (the page carrying its
    // footer marker) must also carry its own title text — not the asset's
    // stale cached "Review Lesson" heading name, and not blank.
    LESSON_NUMBERS.forEach((n) => {
      const marker = footerMarkerFor(n);
      const contentPageIndex = firstContentPageIndexFor(pages, marker);
      expect(contentPageIndex).toBeGreaterThan(-1);
      expect(pages[contentPageIndex]).toContain(LESSON_TITLES[n]);
    });

    // text:title: the front-matter footer resolves a real, non-blank book
    // title on every front-matter page (empirically the "Front matter"
    // master page's own footer, carrying the title alongside the live
    // Quarter field checked above — confirmed present through Page iii,
    // immediately before lesson 14's own first content page).
    const tocFooterPages = pages.slice(0, firstContentPageIndexFor(pages, footerMarkerFor(14)));
    expect(tocFooterPages.length).toBeGreaterThan(0);
    tocFooterPages
      .filter((p) => /Page\s+i+\b/.test(p))
      .forEach((p) => {
        expect(p).toContain("Lessons from Luke");
      });
  });

  test("body-content list rendering: a body-list style referenced by lesson content (e.g. 'Bullet - checkmark') still carries a bullet/numbering definition after template application (FR-005, regression guard — not a discriminating check per contracts/template-application.md §4)", () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-list-style");

    const listStyle =
      /<text:list-style style:name="Bullet_20_-_20_checkmark"[^>]*>[\s\S]*?<\/text:list-style>/.exec(
        stylesXml
      )?.[0];
    expect(listStyle).toBeDefined();

    const level1Bullet = /<text:list-level-style-bullet text:level="1"[^>]*>/.exec(listStyle!)?.[0];
    expect(level1Bullet).toBeDefined();
    const bulletChar = /text:bullet-char="([^"]*)"/.exec(level1Bullet!)?.[1];
    expect(bulletChar).toBeDefined();
    expect(bulletChar).not.toHaveLength(0);
  });

  // "page-offset parity" (pre-017: `finalPrintedPageNumber` toBe
  // `physicalPageCount`) retired here. That relative oracle assumed a single
  // continuous printed-number sequence spanning the whole physical page
  // count; 017's roman-front-matter + arabic-body-restart design (contract
  // §2.2) makes that assumption structurally false by intent — the printed
  // sequence restarts at the first lesson opening, so the final printed
  // number is the body's own absolute position, not the physical page total
  // (empirically: 84 vs. 88 physical pages, a 4-page front-matter delta).
  // c2a2fce (US1-T4 GREEN) called out this exact fallout as known/expected
  // and assigned US1-T5 to replace it with FR-016's absolute,
  // pdfinfo-reconciled assertions. The "last physical page prints its
  // correct absolute body position" check below (line ~916-923) is that
  // replacement — same coverage, correct oracle.

  test('017 US1-T5 FR-016 (absolute, oracle-classified): physical page 2 prints "ii", and every suppressed page (a lesson\'s own title page AND a Coloring_20_Page — whose footer carries the Quarter/Lesson marker twice and NO page-number field, so it silently consumes a slot too) accounts for exactly one skipped value with no gap or repeat, walking the F2b pdfinfo-reconciled page classification rather than a raw split', () => {
    const reconciled = reconciledPagesFor(outputPath, workDir, fullText);

    // (a) Physical page 3 (0-indexed 2) is on the front-matter roman
    // sequence and prints the absolute value "ii" — not merely "some roman
    // numeral", and not derived from any other page's printed value.
    // Physical page 2 (0-indexed 1, the front matter's own title page, the
    // restart target) prints NOTHING — a title page never shows its own
    // page number, the same suppression shape a lesson's own opening title
    // page uses (contract §2.2) — so "ii" (an absolute position of 2 in the
    // roman sequence) is the NEXT page's printed value, not the restart
    // page's own.
    expect(pageNumberFooterOn(reconciled[2])).toBe("ii");

    // The body sequence begins at the FIRST oracle-classified "lesson-title"
    // page (lesson 14's own suppressed opening) — distinct from the older
    // marker-substring scan `firstContentPageIndexFor` uses, since that
    // helper locates the first CONTENT page, one page later. Searched AFTER
    // the front matter/TOC run's own last page: `classifyPage`'s
    // "lesson-title" class (real body text, no marker, no page number) is
    // structurally indistinguishable from the front matter's OWN suppressed
    // title page (US1-T6's own anchor target, above — it carries no marker
    // and no page number either), so an unqualified first-match would wrongly
    // pick that earlier page instead of the real lesson opening.
    const classes = reconciled.map(classifyPage);
    const frontMatterEndIndex = classes.reduce(
      (last, pageClass, index) =>
        pageClass === "front-matter" || pageClass === "table-of-contents" ? index : last,
      -1
    );
    const bodyStartIndex = classes.findIndex(
      (pageClass, index) => index > frontMatterEndIndex && pageClass === "lesson-title"
    );
    expect(bodyStartIndex).toBeGreaterThan(-1);
    const bodyPages = reconciled.slice(bodyStartIndex);

    // Absolute walk: a running body-position counter derived purely from
    // each page's own classification, advancing by exactly one per page,
    // regardless of whether that page prints a number.
    const lastPrintedPosition = assertAbsoluteBodySequence(bodyPages);

    // Lesson 1's (lesson 14's) own first CONTENT page — the page right
    // after its suppressed title page — prints "2": the restart target
    // (the suppressed title page itself) IS absolute page 1 of the new
    // count (contract §2.2's `style:page-number="1"`), it simply never
    // shows its own footer — the same suppression shape as the front
    // matter's own title page (US1-T6's own check, above) — so the FIRST
    // page whose footer IS visible is already absolute position 2. This
    // matches `assertAbsoluteBodySequence`'s own running-position model
    // (which the walk above already verified end-to-end): the title page
    // consumes slot 1 silently, so the first content page's own consumed
    // slot — and printed value — is 2, not 1.
    const firstLessonContentIndex = bodyPages.findIndex(
      (pageText) => classifyPage(pageText) === "lesson-content"
    );
    expect(firstLessonContentIndex).toBeGreaterThan(-1);
    expect(pageNumberFooterOn(bodyPages[firstLessonContentIndex])).toBe("2");

    // The book's last physical page overall, if it is itself a numbered
    // content page, must print exactly the running position the absolute
    // walk independently computed for it — the book's own final position in
    // the body sequence, not merely "one more than its physical neighbor".
    const lastPage = reconciled[reconciled.length - 1];
    if (classifyPage(lastPage) === "lesson-content") {
      expect(pageNumberFooterOn(lastPage)).toBe(String(lastPrintedPosition));
    }
  });

  test("017 US1-T6 FR-016/contract §2.2 front-matter anchor (Gate 7 — F1's spike deferred it as NEEDS OPERATOR, see spike/FINDINGS.md; SETTLED EMPIRICALLY in THIS session's real render, since a working render was exactly what F1 lacked): today, with the explicit front-matter anchor wired, check (a) PASSES — physical page 3 prints \"ii\" (physical page 2, the restart target itself — front matter's own title page — never shows its own number, the same suppression shape a lesson's own opening title page uses) — confirming per contract §2.2's own decision criterion that the anchor was required, not redundant", () => {
    // (a) — the diagnostic read itself: WITH the anchor wired, physical page
    // 3 (0-indexed 2) DOES print "ii" (confirmed by running this exact
    // render in this session — recorded here as the empirical Gate 7 answer
    // FINDINGS.md could not produce). This is the discriminating check that
    // settles "redundant" vs "required" in contract §2.2's own decision
    // procedure — US1-T5's RED version of this same assertion recorded the
    // pre-fix negative reading (`.not.toBe("ii")`); flipped here now that
    // US1-T6 has wired the anchor, per contract §2.2's decision criterion.
    const reconciled = reconciledPagesFor(outputPath, workDir, fullText);
    expect(pageNumberFooterOn(reconciled[2])).toBe("ii");

    // The desired end state (US1-T6's job): an explicit
    // `style:page-number="1"` anchor on front matter's own first body
    // paragraph, under the SAME clone-and-repoint isolation discipline as
    // the body restart (contract §2.2) — the automatic style the anchor is
    // set on must be referenced ONLY by that one paragraph, never a style
    // shared with any other paragraph.
    const contentXml = extractContentXml(
      outputPath,
      workDir,
      "content-extract-front-matter-anchor"
    );
    const contentDoc = libxmljs2.parseXml(contentXml);
    const officeText = contentDoc.get<Element>("//office:body/office:text", ODF_NAMESPACES);
    expect(officeText).toBeDefined();
    // The first BODY paragraph, not merely the first child element overall:
    // `office:text`'s content model legitimately opens with declaration
    // elements (`office:forms`, `text:sequence-decls`,
    // `text:user-field-decls`, …) ahead of any real content — the same set
    // `finalizeAssembledQuarter`'s own `OFFICE_TEXT_DECLARATIONS` skips —
    // so the anchor target is the first element whose local name is NOT one
    // of those declarations.
    const officeTextDeclarations = new Set([
      "tracked-changes",
      "variable-decls",
      "sequence-decls",
      "user-field-decls",
      "dde-connection-decls",
      "alphabetical-index-auto-mark-file",
      "forms",
    ]);
    const firstBodyElement = officeText!
      .find<Element>("*", ODF_NAMESPACES)
      .find((element) => !officeTextDeclarations.has(element.name()));
    expect(firstBodyElement).toBeDefined();
    const firstBodyStyleName = firstBodyElement!.attr("style-name")?.value();
    expect(firstBodyStyleName).toBeDefined();
    const firstBodyAutoStyle = contentDoc.get<Element>(
      `//office:automatic-styles/style:style[@style:name='${firstBodyStyleName}']`,
      ODF_NAMESPACES
    );
    expect(firstBodyAutoStyle).toBeDefined();
    const anchorRestart = firstBodyAutoStyle!
      .get<Element>("style:paragraph-properties", ODF_NAMESPACES)
      ?.attr("page-number")
      ?.value();
    expect(anchorRestart).toBe("1");
    // Isolation: that automatic style is referenced by exactly ONE element
    // in the whole book (front matter's own first paragraph) — never a
    // style shared with another paragraph, which would restart numbering
    // everywhere else it is used too.
    const referencingElements = contentDoc.find<Element>(
      `//office:body//*[@text:style-name='${firstBodyStyleName}']`,
      ODF_NAMESPACES
    );
    expect(referencingElements).toHaveLength(1);

    // Book-wide: with the front-matter anchor added, TWO automatic styles
    // carry the restart — front matter's own AND the lesson-opening body
    // restart (contract §2.2's "Body restart (FR-005)") — never more, and
    // never fewer once both are wired.
    const allRestarts = contentDoc
      .find<Element>("//office:automatic-styles/style:style", ODF_NAMESPACES)
      .filter(
        (style) =>
          style
            .get<Element>("style:paragraph-properties", ODF_NAMESPACES)
            ?.attr("page-number")
            ?.value() === "1"
      );
    expect(allRestarts).toHaveLength(2);
  });
});

/**
 * US16 — covers never affect quarter assembly (FR-012 regression fence).
 *
 * Spec: specs/008-covers-in-platform/spec.md §User Story 4, §FR-012.
 * Acceptance spec: specs/acceptance-specs/US16-covers-never-affect-assembly.txt
 *
 * The reserved cover lesson numbers (`COVER_A4_LESSON` = 97,
 * `COVER_A3_LESSON` = 98) live in the SAME (book, series) as the quarter's
 * real 14 constituents (the TOC + 13 lessons) — cover masters are uploaded
 * per (book, series), not per-quarter-only. `assemblyController.ts`'s
 * current constituent-selection logic (`makeRunner`, `assemblyController.ts`
 * line ~128) filters `storage.lessons()` by `(book, series)` ONLY, so it
 * happily lets 97/98 leak into the constituent set handed to
 * `assembleQuarter` — the confirmed FR-012 defect (plan.md "Risks item 3",
 * research.md §R3). This block reproduces that exact selection logic
 * in-test (there is no exported helper to call directly yet — providing one
 * is the Green task's job, lessons-from-luke-l96d.5.9.2) against a quarter
 * whose lesson set includes both covers, and asserts BOTH the desired
 * constituent-selection contract (a) and its real, observable consequence
 * for the assembled `.odt` (b) — the actual `assembleQuarter`/`sofficeAssemble`
 * pipeline, unmocked, exactly as the top-level golden-reference block above
 * exercises it. Today, (a) fails outright (the reproduced selection logic
 * includes 97/98) and (b) fails because the real merge pulls in visible
 * cover content (the "Year of Publication" boilerplate every committed
 * cover-master fixture carries — see
 * `src/server/xml/coverExtraction.integration.test.ts`).
 */
describe("assembleQuarter (real soffice merge) — US16 covers never affect assembly (FR-012)", () => {
  const COVER_LESSON_NUMBERS = [COVER_A4_LESSON, COVER_A3_LESSON];
  /** TOC + 13 real lessons + the two reserved cover lesson numbers, all sharing (BOOK, SERIES) — exactly how cover masters are actually uploaded (per-book/series, not per-quarter). */
  const ALL_LESSON_NUMBERS_INCLUDING_COVERS = [...ORDERED_LESSON_NUMBERS, ...COVER_LESSON_NUMBERS];

  let workDir: string;
  let workRoot: string;
  let jobId: string;
  let outputPath: string;
  let fullTextWithCovers: string;

  /**
   * Calls the REAL production constituent-selection logic
   * (`assemblyController.ts`'s exported `selectAssemblyConstituents` —
   * `TOC ∪ expectedLessonNumbers(series)`, added by
   * lessons-from-luke-l96d.5.9.2 to fix the FR-012 leak), so this test
   * exercises the actual fix rather than a hand-reproduced formula.
   */
  function currentControllerConstituentSelection(allQuarterLessons: readonly Lesson[]): Lesson[] {
    return selectAssemblyConstituents(allQuarterLessons, BOOK, SERIES);
  }

  /** The desired FR-012 contract: TOC ∪ the 13 expected lesson numbers — reserved cover numbers excluded. */
  function isExpectedAssemblyConstituent(lessonNumber: number): boolean {
    return lessonNumber === TOC_LESSON || expectedLessonNumbers(SERIES).includes(lessonNumber);
  }

  beforeAll(async () => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    execFileSync("pdftotext", ["-v"]);

    // Cover-master fixtures for series 2 must exist (committed alongside the
    // rest of the golden-reference fixtures — see
    // src/server/xml/coverExtraction.integration.test.ts's doc comment).
    COVER_LESSON_NUMBERS.forEach((n) => {
      expect(fs.existsSync(sourcePathFor(n))).toBe(true);
    });

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-covers-leak-"));
    workRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(workRoot, { recursive: true });
    jobId = "covers-leak-check";
    fs.mkdirSync(path.join(workRoot, jobId), { recursive: true });

    const allQuarterLessons = ALL_LESSON_NUMBERS_INCLUDING_COVERS.map(lesson);

    outputPath = await assembleQuarter({
      storage,
      // What production actually hands `assembleQuarter` today, per the
      // reproduced (book, series)-only selection above.
      lessons: currentControllerConstituentSelection(allQuarterLessons),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId,
      workRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    const profileDir = path.join(workDir, "pdf-profile");
    const pdfPath = convertToPdf(outputPath, workDir, profileDir);
    fullTextWithCovers = pdfToText(pdfPath);
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("(FR-012, scenario 1) a quarter with no covers uploaded still reports complete — covers are not missing parts", () => {
    // Already correct today (research.md §R3) — included as the documented
    // invariant this fix must not regress, not a new defect.
    const noCoversLessons = ORDERED_LESSON_NUMBERS.map(lesson);
    expect(missingQuarterParts(BOOK, SERIES, noCoversLessons)).toEqual([]);
    expect(isCompleteQuarter(BOOK, SERIES, noCoversLessons)).toBe(true);
  });

  test("(FR-012, scenario 1 continued) completeness is unchanged once covers are uploaded — covers never count as extra/missing parts", () => {
    const withCoversLessons = ALL_LESSON_NUMBERS_INCLUDING_COVERS.map(lesson);
    expect(missingQuarterParts(BOOK, SERIES, withCoversLessons)).toEqual([]);
    expect(isCompleteQuarter(BOOK, SERIES, withCoversLessons)).toBe(true);
  });

  test("(FR-012, scenario 2, part a — THE DEFECT) the constituent set handed to assembleQuarter excludes reserved cover lesson numbers", () => {
    const allQuarterLessons = ALL_LESSON_NUMBERS_INCLUDING_COVERS.map(lesson);
    const constituents = currentControllerConstituentSelection(allQuarterLessons);
    const leaked = constituents
      .map((lsn) => lsn.lesson)
      .filter((n) => !isExpectedAssemblyConstituent(n));

    // Fails today: `currentControllerConstituentSelection` (== production's
    // live (book, series)-only filter) lets both 97 and 98 through.
    expect(leaked).toEqual([]);
  });

  test("(FR-012, scenario 2, part b — THE DEFECT, observable) the assembled output contains no cover content", () => {
    // "Year of Publication" (capital P) is cover-exclusive boilerplate,
    // present in BOTH committed cover fixtures (A4 and A3 — confirmed via
    // `unzip -p ... content.xml | grep -c "Year of Publication"`) and in NO
    // real constituent, including the TOC — whose own front title page
    // carries the visually-similar but textually distinct "Year of
    // publication" (lowercase p) colophon line, so that string alone
    // doesn't discriminate covers from the TOC's own boilerplate. This
    // marker's presence in the assembled book is direct, real-merge proof
    // the covers leaked in.
    expect(fullTextWithCovers).not.toContain("Year of Publication");
  });
});

describe("assembleQuarter (real soffice merge, corrupt-template fail-loud — 009 US2/FR-004, contracts/template-application.md §5)", () => {
  // A PRESENT, non-empty, but unreadable template — distinct from a MISSING
  // one (which `validateTemplateAsset`'s existence/size gate already
  // catches, unit-tested elsewhere without soffice). This deliberately
  // corrupt fixture is separate from the real shipped
  // `assets/quarter-styles-template.odt` baseline — it is never touched.
  let workDir: string;
  let corruptTemplatePath: string;

  beforeAll(() => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-corrupt-template-"));
    corruptTemplatePath = path.join(workDir, "corrupt-template.odt");
    // A non-empty, non-ODT (non-zip) payload: passes the pre-run
    // existence/size gate (`validateTemplateAsset`) but is not a loadable
    // style source, so the failure must surface at `loadStylesFromURL`
    // inside the macro, not at the pre-run gate.
    fs.writeFileSync(corruptTemplatePath, "this is not a valid ODT/zip file\n".repeat(50));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("a corrupt (present, non-empty, unreadable) template fails the job loudly — not a delivered book, and well before the ~100s hard timeout", async () => {
    const resolveTemplatePathSpy = jest
      .spyOn(quarterStylesTemplate, "resolveTemplatePath")
      .mockReturnValue(corruptTemplatePath);

    const jobId = "corrupt-template";
    const jobWorkRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    const startedAt = Date.now();
    let outcome: { rejected: boolean; value?: unknown };
    try {
      const value = await assembleQuarter({
        storage,
        // A single lesson is enough to exercise the failure — this test is
        // not re-asserting the golden-reference content/ordering axes above.
        lessons: [lesson(LESSON_NUMBERS[0])],
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId,
        workRoot: jobWorkRoot,
      });
      outcome = { rejected: false, value };
    } catch {
      outcome = { rejected: true };
    }
    const elapsedMs = Date.now() - startedAt;

    // Confirm the spy actually fired — i.e. `assembleQuarter` really used
    // the corrupt fixture, not the real shipped (valid) asset (5.1
    // guarantees it exists), which would make this whole test a phantom
    // regardless of which way `outcome` comes out.
    expect(resolveTemplatePathSpy).toHaveBeenCalled();

    // The actual behavioral guarantee (US2/FR-004): a corrupt template
    // MUST fail the job, not deliver a book.
    expect(outcome.rejected).toBe(true);

    // Confirms the error trap fails FAST (via `On Error Goto TemplateFail` +
    // `StarDesktop.terminate()`), not via `sofficeAssemble`'s own ~100s hard
    // timeout kill.
    expect(elapsedMs).toBeLessThan(90_000);

    // No delivered book: the macro's TemplateFail path writes no output file.
    const outputPath = path.join(jobWorkRoot, jobId, "assembled.odt");
    expect(fs.existsSync(outputPath)).toBe(false);
  }, 100_000);
});

describe("assembleQuarter (real soffice merge, template asset swap — 009 US3/FR-005, contracts/template-application.md §1/§4)", () => {
  // Proves the template asset is re-read PER JOB, with no caching, so
  // replacing the asset at the resolved path changes the very next job's
  // output styles with zero code change. Exercised via two test-only
  // alternate style-source fixtures substituted at the resolved path (via
  // the same `resolveTemplatePath` seam the corrupt-template test above
  // uses) — never mutating the real committed
  // `assets/quarter-styles-template.odt`, which stays untouched throughout.
  let workDir: string;
  let fixtureA: string;
  let fixtureB: string;

  beforeAll(() => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-template-swap-"));
    fixtureA = buildStyleSourceFixture(workDir, "fixture-a", "#123456");
    fixtureB = buildStyleSourceFixture(workDir, "fixture-b", "#abcdef");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  async function assembleWithFixture(fixturePath: string, jobId: string): Promise<string> {
    jest.spyOn(quarterStylesTemplate, "resolveTemplatePath").mockReturnValue(fixturePath);

    const jobWorkRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    const outputPath = await assembleQuarter({
      storage,
      // A single lesson suffices — this test only checks the resolved M.T.
      // style property, not the full golden-reference content/ordering axes.
      lessons: [lesson(LESSON_NUMBERS[0])],
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId,
      workRoot: jobWorkRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);
    return outputPath;
  }

  test("two jobs run back-to-back with two different style-source fixtures at the resolved path produce two books carrying each fixture's own M.T. Text background-color, with no caching from the first job into the second", async () => {
    const outputA = await assembleWithFixture(fixtureA, "template-swap-a");
    const stylesXmlA = extractStylesXml(outputA, workDir, "styles-extract-a");
    expect(mtTextBackgroundColor(stylesXmlA)).toBe("#123456");

    const outputB = await assembleWithFixture(fixtureB, "template-swap-b");
    const stylesXmlB = extractStylesXml(outputB, workDir, "styles-extract-b");
    expect(mtTextBackgroundColor(stylesXmlB)).toBe("#abcdef");

    // The real committed asset was never touched by either job.
    const realAssetPath = path.join(process.cwd(), "assets", "quarter-styles-template.odt");
    expect(fs.existsSync(realAssetPath)).toBe(true);
  }, 200_000);
});

describe("assembleQuarter (real soffice merge, monolingual template asset is a clean loadable style source — 009 FR-005)", () => {
  // Proves the committed monolingual asset
  // (`assets/quarter-styles-template-monolingual.odt`, the asset
  // `resolveTemplatePath(true)` selects for single-language assemblies) is a
  // valid, loadable style source whose `M.T. Text` paragraph style carries NO
  // legacy working-highlight — the exact regression 009 exists to prevent, now
  // re-checked against the real monolingual master rather than the bilingual
  // stopgap. NOTE: this drives the asset through soffice via the
  // English+English short-circuit (a real single-language `majorityLangId === 0`
  // assembly needs storage/fixtures); the `majorityLangId === 0 → monolingual`
  // SELECTION mapping is covered by the unit tests, not this test.
  let workDir: string;

  beforeAll(() => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-monolingual-"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("the committed monolingual asset loads as a template and yields an M.T. Text style with no legacy #ffffcc highlight", async () => {
    // The real path the single-language branch resolves. Spied so this single
    // real lesson (English mother + English majority, which short-circuits
    // makeLessonFile to the raw source) is styled by the actual monolingual
    // asset — exercising the monolingual branch end-to-end through soffice.
    const monolingualAssetPath = quarterStylesTemplate.resolveTemplatePath(true);
    expect(monolingualAssetPath).toBe(
      path.join(process.cwd(), "assets", "quarter-styles-template-monolingual.odt")
    );
    expect(fs.existsSync(monolingualAssetPath)).toBe(true);

    jest.spyOn(quarterStylesTemplate, "resolveTemplatePath").mockReturnValue(monolingualAssetPath);

    const jobId = "monolingual-template";
    const jobWorkRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    const outputPath = await assembleQuarter({
      storage,
      lessons: [lesson(LESSON_NUMBERS[0])],
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId,
      workRoot: jobWorkRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-monolingual");
    // No legacy working-highlight: the M.T. Text background must not be the
    // #ffffcc highlight color (transparent or absent are both acceptable).
    expect(mtTextBackgroundColor(stylesXml)).not.toBe("#ffffcc");

    // 017 FR-004/SC-005, INV-1 (single-language): same zero-occurrence
    // guarantee as the bilingual golden-reference corpus, checked here
    // against a real offset-carrying constituent (Luke-2-14v01, which
    // carries its own Front_20_matter text:page-adjust="-3" per
    // data-model.md's corpus table) merged through the monolingual asset.
    const contentXmlForPageAdjust = extractContentXml(
      outputPath,
      workDir,
      "content-extract-monolingual-page-adjust"
    );
    expect(stylesXml).not.toContain("text:page-adjust");
    expect(contentXmlForPageAdjust).not.toContain("text:page-adjust");

    // FR-002 (contracts/template-application.md §4): the 'First Page' master
    // page style has no <style:footer> element in single-language mode
    // either — the same footer-less-First-Page-wins guarantee as bilingual.
    const firstPageMaster = masterPageBlock(stylesXml, "First Page");
    expect(firstPageMaster).toBeDefined();
    expect(firstPageMaster).not.toContain("<style:footer>");

    // contracts/template-application.md §4 "Per-lesson content footers
    // resolve": the monolingual asset ships STALE CACHED footer field text —
    // `text:user-defined[Quarter]` = 4, `text:chapter[number]` = 51/52
    // (data-model.md) — from whatever quarter/lesson the template was last
    // saved against. This is the ONE fixture combination in this file where
    // the asset's cached values genuinely diverge from this job's REAL
    // values (quarter 2, lesson 14): the bilingual asset's own cache
    // coincidentally matches series 2's real values, so only here can a
    // footer assertion actually DISCRIMINATE "field re-resolved live" from
    // "field shipped its asset-cached snapshot" (finalize's
    // patchBookMetadata / outline start-value patch either ran and won, or a
    // skipped/failed patch let the cached text ship untouched).
    const profileDir = path.join(workDir, "pdf-profile-monolingual");
    const pdfPath = convertToPdf(outputPath, workDir, profileDir);
    const fullText = pdfToText(pdfPath);

    // The REAL values must be present...
    expect(fullText).toContain("Quarter 2");
    expect(fullText).toContain("Lesson 14");
    // ...and the asset's stale cached values must NOT have shipped through.
    expect(fullText).not.toContain("Quarter 4");
    expect(fullText).not.toContain("Lesson 51");
    expect(fullText).not.toContain("Lesson 52");

    // --- Monolingual restyle (014): the monolingual template deliberately
    // omits the four M.T. styles below, so any surviving REFERENCE to them in
    // the assembled book keeps the constituent's stale formatting (the
    // verified 0.6 cm Lesson Title top-margin defect). Assembled monolingual
    // output must carry NO references to those four names — in either
    // reference shape (`text:style-name` direct refs and
    // `style:parent-style-name` automatic-style parents), in EITHER file
    // (content.xml and styles.xml — the Luke-2-14 constituent parents a
    // footer automatic style on `M.T. Coloring Page - Truth` in styles.xml).
    // Definitions (`style:name="M.T._20_..."`) may legitimately survive
    // unreferenced, so these checks target reference attributes only.
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-monolingual");
    MONOLINGUAL_RESTYLED_MT_NAMES.forEach((mtName) => {
      expect(contentXml).not.toContain(`text:style-name="${mtName}"`);
      expect(contentXml).not.toContain(`style:parent-style-name="${mtName}"`);
      expect(stylesXml).not.toContain(`text:style-name="${mtName}"`);
      expect(stylesXml).not.toContain(`style:parent-style-name="${mtName}"`);
    });

    // ...and the renamed plain references must be present in their place
    // (both reference shapes exist in the Luke-2-14 constituent: a direct
    // `text:style-name` ref for Lesson Title, automatic-style parents for
    // Coloring Page - Truth).
    expect(contentXml).toContain('text:style-name="Lesson_20_Title"');
    expect(contentXml).toContain('style:parent-style-name="Coloring_20_Page_20_-_20_Truth"');

    // Spacing pin for the actual defect: the plain `Lesson Title` style the
    // restyled title now resolves to must carry the monolingual template's
    // 0.9 cm top margin (the constituent's stale M.T. value was 0.3 cm).
    const lessonTitleStyle =
      /<style:style style:name="Lesson_20_Title"[^>]*>[\s\S]*?<\/style:style>/.exec(stylesXml)?.[0];
    expect(lessonTitleStyle).toBeDefined();
    // The asset stores 0.9cm; soffice re-serializes lengths in inches
    // (0.9 cm = 0.3543 in), so accept either spelling of the same measure.
    expect(lessonTitleStyle).toMatch(/fo:margin-top="(0\.9cm|0\.3543in)"/);

    // 017 US1-T5 FR-016 (absolute, oracle-classified, MONOLINGUAL mode — the
    // "both modes" half of this task): this fixture is a single lesson with
    // no front matter/TOC constituent, so the body sequence begins at
    // physical page 0. Same F2b pdfinfo-reconciled walk as the bilingual
    // golden-reference check, on this mode's own render.
    const physicalPageCount = pdfPageCount(pdfPath);
    const reconciled = reconcilePdfPages(fullText, physicalPageCount);
    const classes = reconciled.map(classifyPage);
    const bodyStartIndex = classes.findIndex((pageClass) => pageClass === "lesson-title");
    expect(bodyStartIndex).toBeGreaterThan(-1);
    const bodyPages = reconciled.slice(bodyStartIndex);

    assertAbsoluteBodySequence(bodyPages);

    // The lesson's own suppressed title page IS absolute page 1 of the
    // restart (contract §2.2's `style:page-number="1"`); it never shows its
    // own footer, so the first VISIBLE footer — on the first content page —
    // is already absolute position 2 (matching the bilingual golden-
    // reference check's own reasoning, above).
    const firstLessonContentIndex = bodyPages.findIndex(
      (pageText) => classifyPage(pageText) === "lesson-content"
    );
    expect(firstLessonContentIndex).toBeGreaterThan(-1);
    expect(pageNumberFooterOn(bodyPages[firstLessonContentIndex])).toBe("2");

    // --- 018 (MONOLINGUAL mode, the "both modes" half): the terminal-
    // paragraph restyle is a property of `insertDocumentFromURL` itself, so
    // it reproduces even on this single-constituent merge (no following
    // constituent, no boundary page break). Both of Luke-2-14's coloring-page
    // memory verses must keep a memory-verse style — after the monolingual
    // restyle that is the PLAIN family name, which the `$`-anchored patterns
    // match as well as the `M.T.` one.
    const monolingualExpectation = terminalMemoryVerseExpectations(workDir).find(
      (expectation) => expectation.lessonNumber === LESSON_NUMBERS[0]
    );
    expect(monolingualExpectation).toBeDefined();
    const monolingualParagraphs = styledParagraphs(libxmljs2.parseXml(contentXml));
    const carryingVerse = monolingualParagraphs.filter(
      (p) => p.text === monolingualExpectation!.verse
    );
    expect({
      memoryVerse: carryingVerse.filter((p) => MEMORY_VERSE_STYLE_PATTERN.test(p.namedStyle))
        .length,
      graphicNumber: carryingVerse.filter((p) => GRAPHIC_NUMBER_STYLE_PATTERN.test(p.namedStyle))
        .length,
    }).toEqual({ memoryVerse: monolingualExpectation!.memoryVerseCount, graphicNumber: 0 });

    // Same companion invariants as bilingual: no surviving marker paragraph
    // and no empty memory-verse paragraph (the stray yellow band).
    expect(contentXml).not.toContain(SACRIFICIAL_MARKER_TEXT);
    expect(fullText).not.toContain(SACRIFICIAL_MARKER_TEXT);
    expect(
      monolingualParagraphs.filter(
        (p) => p.text === "" && MEMORY_VERSE_STYLE_PATTERN.test(p.namedStyle)
      )
    ).toHaveLength(0);
  }, 200_000);
});

describe("assembleQuarter (real soffice merge, doctored Lesson-9-shaped constituent — 014 WS2 end-to-end)", () => {
  // The production Luke-1-09 constituent's opening heading carries only
  // `fo:break-before="page"` — no `style:master-page-name` — so the whole
  // lesson inherits the previous page's master. No committed fixture ships
  // that defect, so this doctors a copy of Luke-2-15 into the exact shape
  // and proves `finalizeAssembledQuarter`'s normalization survives the real
  // soffice merge (i.e. soffice doesn't undo the patch). This is the one
  // true-RED end-to-end proof for WS2.
  const DOCTORED_VERSION = 90;
  const doctoredPath = path.join(SERVER_DOCS_DIR, `${BOOK}-${SERIES}-15v${DOCTORED_VERSION}.odt`);
  // The exact P28 opening auto style verified in Luke-2-15v01's content.xml.
  const CLEAN_OPENING_STYLE =
    '<style:style style:name="P28" style:family="paragraph" style:parent-style-name="M.T._20_Lesson_20_title_20_-_20_invisible" style:master-page-name="First_20_Page"><style:paragraph-properties style:page-number="auto"/></style:style>';
  const DOCTORED_OPENING_STYLE =
    '<style:style style:name="P28" style:family="paragraph" style:parent-style-name="M.T._20_Lesson_20_title_20_-_20_invisible"><style:paragraph-properties fo:break-before="page"/></style:style>';
  let workDir: string;

  beforeAll(() => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-doctored-"));

    // Doctor a copy of the clean constituent into the Lesson-9 defect shape.
    const srcDir = path.join(workDir, "doctored-src");
    execFileSync("unzip", ["-q", sourcePathFor(15), "-d", srcDir]);
    const contentXmlPath = path.join(srcDir, "content.xml");
    const cleanXml = fs.readFileSync(contentXmlPath, "utf8");
    expect(cleanXml).toContain(CLEAN_OPENING_STYLE);
    fs.writeFileSync(contentXmlPath, cleanXml.replace(CLEAN_OPENING_STYLE, DOCTORED_OPENING_STYLE));
    // Re-zip mimetype FIRST and UNCOMPRESSED (ODF requirement).
    fs.rmSync(doctoredPath, { force: true });
    execFileSync("zip", ["-X", "-0", doctoredPath, "mimetype"], { cwd: srcDir });
    execFileSync("zip", ["-rX", doctoredPath, ".", "-x", "mimetype"], { cwd: srcDir });
  });

  afterAll(() => {
    fs.rmSync(doctoredPath, { force: true });
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("the finalize normalization restores master-page-name First_20_Page on the doctored opening, and the real soffice merge does not undo it", async () => {
    // The doctored input genuinely lacks the master (true-RED precondition:
    // with normalizeLessonOpeningMasterPages absent, the assembled output
    // keeps this defect and the assertion below fails).
    const doctoredUnzipDir = path.join(workDir, "doctored-verify");
    execFileSync("unzip", ["-q", doctoredPath, "content.xml", "-d", doctoredUnzipDir]);
    const doctoredXml = fs.readFileSync(path.join(doctoredUnzipDir, "content.xml"), "utf8");
    expect(doctoredXml).toContain(DOCTORED_OPENING_STYLE);

    const jobId = "doctored-master-page";
    const jobWorkRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    const outputPath = await assembleQuarter({
      storage,
      lessons: [{ ...lesson(15), version: DOCTORED_VERSION }],
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId,
      workRoot: jobWorkRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    const contentXml = extractContentXml(outputPath, workDir, "content-extract-doctored");
    const openings = visibleLessonOpenings(libxmljs2.parseXml(contentXml));
    expect(openings.length).toBeGreaterThan(0);
    openings.forEach(({ autoStyle }) => {
      expect(autoStyle).toBeDefined();
      expect(autoStyle!.attr("master-page-name")?.value()).toBe("First_20_Page");
    });
  }, 200_000);
});

/**
 * US3-T7 RED (contract §4 "Operational kill-switch", "off-branch integration
 * test"): the real `assembleQuarter` pipeline, with `ASSEMBLY_RECTO_FILLER`
 * explicitly disabled. `assembleQuarter` today never reads this env var and
 * never emits any FR-008 warning at all, so the assertion below fails —
 * this is the RED state US3-T8 (GREEN) makes pass. A single-lesson corpus
 * (no TOC required, `orderQuarterLessons` accepts it) keeps this fast: it
 * exercises the same `assembleQuarter` orchestration path the 14-file golden
 * corpus does, without paying for a 14-file merge.
 */
describe("assembleQuarter (real soffice merge) — US3-T7 kill-switch off branch (contract §4)", () => {
  const ENV_VAR = "ASSEMBLY_RECTO_FILLER";
  const originalEnvValue = process.env[ENV_VAR];
  let workDir: string;

  beforeAll(() => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-t7-switch-off-"));
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    if (originalEnvValue === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = originalEnvValue;
    }
  });

  test("with the switch off, assembly skips measurement/re-finalize entirely, still delivers a valid book, and logs exactly one FR-008 warning naming the skipped requirement", async () => {
    process.env[ENV_VAR] = "off";
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    const jobId = "t7-switch-off";
    const jobWorkRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    let outputPath: string | undefined;
    let warnCalls: unknown[][];
    try {
      outputPath = await assembleQuarter({
        storage,
        lessons: [lesson(15)],
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId,
        workRoot: jobWorkRoot,
      });
    } finally {
      // Capture the call history BEFORE mockRestore() — mockRestore() also
      // performs a mockReset() (clears mock.calls/instances/results), so
      // reading warnSpy.mock.calls after restoring would always see [].
      warnCalls = warnSpy.mock.calls;
      warnSpy.mockRestore();
    }

    expect(outputPath).toBeDefined();
    expect(fs.existsSync(outputPath!)).toBe(true);
    fs.rmSync(outputPath!, { force: true });

    const fr008Warnings = warnCalls.filter(([line]) =>
      typeof line === "string" ? line.includes("FR-008") : false
    );
    expect(fr008Warnings).toHaveLength(1);
  }, 200_000);
});

describe("this file's convertToPdf helper (F2a RED — contract §3, shared PDF filter option)", () => {
  test("routes through the shared PDF_CONVERT_TO_TARGET builder (--convert-to filter argument), not a bare 'pdf' target with no IsSkipEmptyPages filter — every render whose output feeds a page inventory pins IsSkipEmptyPages=false (contract §3: 'route every such render through one exported helper that owns the filter argument, and have the integration test assert the argument is present, so a helper edit cannot silently drop it')", () => {
    // A source-level assertion, deliberately: spying on the built-in
    // `child_process` module's `execFileSync` to capture argv without a
    // real soffice invocation hits a non-configurable-property TypeError
    // under ts-jest's esModuleInterop namespace object, and this file's many
    // OTHER tests genuinely need a real, unmocked execFileSync. Reading back
    // this file's own convertToPdf() definition and asserting it references
    // the shared builder is exactly the structural guard contract §3 asks
    // for: "a helper edit cannot silently drop" the filter argument.
    const thisFileSource = fs.readFileSync(__filename, "utf8");
    const convertToPdfSource = /function convertToPdf\([\s\S]*?\n\}\n/.exec(thisFileSource)?.[0];
    expect(convertToPdfSource).toBeDefined();
    expect(convertToPdfSource).toContain("PDF_CONVERT_TO_TARGET");
  });
});

describe("assembleQuarter (real soffice merge, TOC pagination — 018 Q2/Q4 client fixes)", () => {
  let workDir: string;

  beforeAll(() => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-toc-pagination-"));
  });

  afterAll(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  /**
   * Parses a committed TOC master into the LessonString list the real
   * pipeline would hold for it, with masterIds synthesized by exact source
   * text — mirroring `PGStorage.addOrFindMasterStrings`, which dedupes
   * English TStrings by `text` (so identical texts anywhere in the doc share
   * one masterId; the exact sharing that made the front-matter subtitle's
   * "Quarter"/"2" falsely suppress the TOC header before the 1c fix).
   */
  function tocLessonStrings(fixtureName: string): {
    lessonStrings: LessonString[];
    masterIdByText: Map<string, number>;
  } {
    const xmls = docStorage.docXml(path.join(SERVER_DOCS_DIR, fixtureName));
    const docStrings = objKeys(xmls).reduce(
      (all: ReturnType<typeof parse>, xmlType) => all.concat(parse(xmls[xmlType], xmlType)),
      []
    );
    const masterIdByText = new Map<string, number>();
    const lessonStrings = docStrings.map((docString, i) => {
      if (!masterIdByText.has(docString.text)) {
        masterIdByText.set(docString.text, masterIdByText.size + 1);
      }
      return {
        lessonStringId: i + 1,
        masterId: masterIdByText.get(docString.text)!,
        lessonId: TOC_LESSON,
        lessonVersion: 1,
        type: docString.type,
        xpath: docString.xpath,
        motherTongue: docString.motherTongue,
      };
    });
    return { lessonStrings, masterIdByText };
  }

  test("Q2 single-language (real majorityLangId 0 merge of Luke-2-99): the translated TOC header keeps its own page after the copyright table, with the heading row directly beneath it — translated headings rendered, untranslated ones falling back to English", async () => {
    const { lessonStrings, masterIdByText } = tocLessonStrings(`${BOOK}-${SERIES}-99v01.odt`);

    // A French-ish partial translation: the header/subtitle texts and two of
    // the four TOC column headings. "Truth" and "Story" stay untranslated so
    // this test also pins the 1b fallback (source English visible, cell NOT
    // emptied). Every translated text must exist in the fixture.
    const TRANSLATIONS: Record<string, string> = {
      Quarter: "Trimestre",
      "2": "2",
      "Table of Contents": "Table des matières",
      "No.": "N°",
      Title: "Titre",
    };
    const FRENCHISH_ID = 42;
    const mtTStrings: TString[] = Object.entries(TRANSLATIONS).map(([source, text]) => {
      const masterId = masterIdByText.get(source);
      expect(masterId).toBeDefined();
      return { masterId: masterId!, languageId: FRENCHISH_ID, text, history: [] };
    });

    const frenchishLang: Language = {
      languageId: FRENCHISH_ID,
      name: "Frenchish",
      code: "fr",
      motherTongue: true,
      progress: [],
      archived: false,
      defaultSrcLang: 0,
    };
    const tocLesson: Lesson = { ...lesson(TOC_LESSON), lessonStrings };
    const singleLangStorage = {
      tStrings: async ({ lessonId }: { languageId: number; lessonId?: number }) =>
        lessonId === TOC_LESSON ? mtTStrings : [],
    } as unknown as Persistence;

    const jobId = "toc-pagination-single-language";
    const jobWorkRoot = path.join(workDir, "assembly-work-q2");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    const outputPath = await assembleQuarter({
      storage: singleLangStorage,
      lessons: [tocLesson, lesson(LESSON_NUMBERS[0])],
      motherLang: frenchishLang,
      majorityLangId: 0,
      jobId,
      workRoot: jobWorkRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    // The merged book still carries the header paragraph's text — before the
    // 1a/1c fixes the whole break-carrying paragraph was deleted from the
    // single-language constituent.
    const contentXml = extractContentXml(outputPath, workDir, "content-extract-q2-toc");
    expect(contentXml).toContain("Trimestre");
    expect(contentXml).toContain("Table des matières");

    const profileDir = path.join(workDir, "pdf-profile-q2");
    const pages = pagesOf(pdfToText(convertToPdf(outputPath, workDir, profileDir)));

    const headerPageIndex = pages.findIndex((pageText) =>
      /Trimestre\s+2\s+Table des matières/.test(pageText)
    );
    expect(headerPageIndex).toBeGreaterThanOrEqual(0);
    const headerPage = pages[headerPageIndex];

    // The fixed page break survived: the header starts a NEW page after the
    // copyright/license table's page.
    const copyrightPageIndex = pages.findIndex((pageText) => pageText.includes(CC_FOOTER_MARKER));
    expect(copyrightPageIndex).toBeGreaterThanOrEqual(0);
    expect(headerPageIndex).toBeGreaterThan(copyrightPageIndex);
    expect(headerPage).not.toContain(CC_FOOTER_MARKER);

    // Adjacency: the TOC table's column-heading row sits directly under the
    // header on the SAME page — translated headings in translation,
    // untranslated ones as visible English (1b), never as emptied cells.
    expect(headerPage).toContain("N°");
    expect(headerPage).toContain("Titre");
    expect(headerPage).toContain("Truth");
    expect(headerPage).toContain("Story");
    // And the first real TOC row too (its untranslated MT title falls back
    // to the English source).
    expect(headerPage).toContain(LESSON_TITLES[14]);
  }, 280_000);

  test("Q4 single-language (real majorityLangId 0 merge of the Acts-4-99 TOC): blank-header protection, container-scoped suppression and the table flip compose — translated header on its own page with the split table directly beneath", async () => {
    const { lessonStrings, masterIdByText } = tocLessonStrings("Acts-4-99v01.odt");

    const TRANSLATIONS: Record<string, string> = {
      Quarter: "Trimestre",
      "4": "4",
      "Table of Contents": "Table des matières",
      "No.": "N°",
      Title: "Titre",
    };
    const FRENCHISH_ID = 42;
    const mtTStrings: TString[] = Object.entries(TRANSLATIONS).map(([source, text]) => {
      const masterId = masterIdByText.get(source);
      expect(masterId).toBeDefined();
      return { masterId: masterId!, languageId: FRENCHISH_ID, text, history: [] };
    });

    const frenchishLang: Language = {
      languageId: FRENCHISH_ID,
      name: "Frenchish",
      code: "fr",
      motherTongue: true,
      progress: [],
      archived: false,
      defaultSrcLang: 0,
    };
    const actsToc: Lesson = {
      lessonId: TOC_LESSON,
      book: "Acts",
      series: 4,
      lesson: TOC_LESSON,
      version: 1,
      lessonStrings,
    };
    const singleLangStorage = {
      tStrings: async ({ lessonId }: { languageId: number; lessonId?: number }) =>
        lessonId === TOC_LESSON ? mtTStrings : [],
    } as unknown as Persistence;

    const jobId = "toc-pagination-acts-single-language";
    const jobWorkRoot = path.join(workDir, "assembly-work-q4-mono");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    // Companion Luke lesson again — only so lesson-1 parity has an opening
    // page to measure; the Acts TOC's rendering is what is under test.
    const outputPath = await assembleQuarter({
      storage: singleLangStorage,
      lessons: [actsToc, lesson(LESSON_NUMBERS[0])],
      motherLang: frenchishLang,
      majorityLangId: 0,
      jobId,
      workRoot: jobWorkRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    const profileDir = path.join(workDir, "pdf-profile-q4-mono");
    const pages = pagesOf(pdfToText(convertToPdf(outputPath, workDir, profileDir)));

    const headerPageIndex = pages.findIndex((pageText) =>
      /Trimestre\s+4\s+Table des matières/.test(pageText)
    );
    expect(headerPageIndex).toBeGreaterThanOrEqual(0);
    const headerPage = pages[headerPageIndex];

    const copyrightPageIndex = pages.findIndex((pageText) => pageText.includes(CC_FOOTER_MARKER));
    expect(copyrightPageIndex).toBeGreaterThanOrEqual(0);
    expect(headerPageIndex).toBeGreaterThan(copyrightPageIndex);
    expect(headerPage).not.toContain(CC_FOOTER_MARKER);

    expect(headerPage).toContain("N°");
    expect(headerPage).toContain("Titre");
    expect(headerPage).toContain("Truth");
    expect(headerPage).toContain("Story");
    // (the full title wraps mid-phrase in this narrow pdftotext column)
    expect(headerPage).toContain("Jesus encourages Paul");
  }, 280_000);

  test("Q4 bilingual (real merge of the Acts-4-99 TOC): the unsplittable-table fix keeps the TOC table on the header's page instead of pushing it whole to the next page", async () => {
    const actsToc: Lesson = {
      lessonId: TOC_LESSON,
      book: "Acts",
      series: 4,
      lesson: TOC_LESSON,
      version: 1,
      lessonStrings: [],
    };

    const jobId = "toc-pagination-acts-bilingual";
    const jobWorkRoot = path.join(workDir, "assembly-work-q4");
    fs.mkdirSync(path.join(jobWorkRoot, jobId), { recursive: true });

    // English+English short-circuits makeLessonFile to the raw committed
    // fixture — the merge itself (template footer geometry included) is real.
    // The companion lesson constituent is the committed Luke-2-14 fixture:
    // the assembly machinery is per-file (no Acts lesson master is
    // committed), it exists only so the lesson-1 parity measurement has an
    // opening page to find — the behavior under test is the Acts TOC's.
    const outputPath = await assembleQuarter({
      storage,
      lessons: [actsToc, lesson(LESSON_NUMBERS[0])],
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId,
      workRoot: jobWorkRoot,
    });
    expect(fs.existsSync(outputPath)).toBe(true);

    const profileDir = path.join(workDir, "pdf-profile-q4");
    const pages = pagesOf(pdfToText(convertToPdf(outputPath, workDir, profileDir)));

    const headerPageIndex = pages.findIndex((pageText) =>
      /Quarter\s+4\s+Table of Contents/.test(pageText)
    );
    expect(headerPageIndex).toBeGreaterThanOrEqual(0);
    const headerPage = pages[headerPageIndex];

    // The defect: with may-break-between-rows="false" surviving into the
    // merge, the 13-row TOC table no longer fit under the header (the
    // template's Front_20_matter footer is taller than the constituent's)
    // and jumped WHOLE to the next page, orphaning the header. Fixed, the
    // table starts directly under the header: its heading row and first
    // lesson row render on the header's own page.
    // ("No." renders split across two lines by pdftotext's -layout in this
    // narrow column, so it is asserted as the bare word.)
    expect(headerPage).toMatch(/\bNo\b/);
    expect(headerPage).toContain("Title");
    expect(headerPage).toContain("Truth");
    expect(headerPage).toContain("Story");
    // And the first real TOC row (lesson 40) starts on the same page.
    expect(headerPage).toContain("Jesus encourages Paul in a dream");
  }, 280_000);
});

/**
 * Client feedback (Kwasio/French review): the assembled quarter book kept
 * ENGLISH footers — "Lessons from Luke", "Teacher's Guide", "Quarter",
 * "Lesson", "Page" — even when the book itself was fully translated, because
 * those words live as literal spans inside the committed quarter styles
 * template that `sofficeAssemble`'s macro loads verbatim.
 *
 * This exercises the real merge + real template load in a NON-English
 * language, then reads the delivered book's own `styles.xml` footers and its
 * rendered text. The constituents' bodies stay English (the fixture lessons
 * carry no lesson strings) — only the template's footer vocabulary is under
 * test here, so every marker below is a made-up, ASCII, unmistakable token
 * that appears nowhere in the English corpus.
 */
describe("assembleQuarter (real soffice merge) — translated footers", () => {
  const TRANSLATED_LANGUAGE_ID = 4242;
  const TITLE_MASTER_ID = 900_001;
  const SUBJECT_MASTER_ID = 900_002;
  const QUARTER_MASTER_ID = 900_003;
  const LESSON_MASTER_ID = 900_004;
  const PAGE_MASTER_ID = 900_005;

  const TRANSLATED_TITLE = "Lekcje z Lukasza";
  const TRANSLATED_SUBJECT = "Podrecznik nauczyciela";
  const TRANSLATED_QUARTER = "Trimestro";
  const TRANSLATED_LESSON = "Lekcja";
  const TRANSLATED_PAGE = "Strona";

  function corpusTString(masterId: number, languageId: number, text: string): TString {
    return { masterId, languageId, text, history: [] };
  }

  const ENGLISH_FOOTER_CORPUS: TString[] = [
    corpusTString(TITLE_MASTER_ID, ENGLISH_ID, "Lessons from Luke"),
    corpusTString(SUBJECT_MASTER_ID, ENGLISH_ID, "Teacher’s Guide"),
    corpusTString(QUARTER_MASTER_ID, ENGLISH_ID, "Quarter"),
    corpusTString(LESSON_MASTER_ID, ENGLISH_ID, "Lesson"),
    corpusTString(PAGE_MASTER_ID, ENGLISH_ID, "Page"),
  ];

  const TRANSLATIONS: TString[] = [
    corpusTString(TITLE_MASTER_ID, TRANSLATED_LANGUAGE_ID, TRANSLATED_TITLE),
    corpusTString(SUBJECT_MASTER_ID, TRANSLATED_LANGUAGE_ID, TRANSLATED_SUBJECT),
    corpusTString(QUARTER_MASTER_ID, TRANSLATED_LANGUAGE_ID, TRANSLATED_QUARTER),
    corpusTString(LESSON_MASTER_ID, TRANSLATED_LANGUAGE_ID, TRANSLATED_LESSON),
    corpusTString(PAGE_MASTER_ID, TRANSLATED_LANGUAGE_ID, TRANSLATED_PAGE),
  ];

  /**
   * Read-only `Persistence` double. `makeLessonFile`'s per-lesson reads
   * (`lessonId` scoped) return nothing, so every constituent's body stays the
   * English master's; the resolver's two corpus reads are the ones that matter.
   */
  const translatedStorage = {
    tStrings: async (params: { languageId: number; lessonId?: number; masterIds?: number[] }) => {
      if (params.lessonId !== undefined) return [];
      if (params.languageId === ENGLISH_ID) return ENGLISH_FOOTER_CORPUS;
      return TRANSLATIONS.filter((ts) => params.masterIds?.includes(ts.masterId));
    },
  } as unknown as Persistence;

  const translatedLang: Language = {
    languageId: TRANSLATED_LANGUAGE_ID,
    name: "Testish",
    code: "tst",
    motherTongue: true,
    progress: [],
    archived: false,
    defaultSrcLang: ENGLISH_ID,
  };

  /** The TOC constituent's own `dc:title`/`dc:subject` meta strings — how the resolver finds the book title. */
  function tocLessonWithMetaStrings(): Lesson {
    const metaString = (masterId: number, xpath: string): LessonString => ({
      lessonStringId: masterId,
      masterId,
      lessonId: TOC_LESSON,
      lessonVersion: 1,
      type: "meta",
      xpath,
      motherTongue: false,
    });
    return {
      ...lesson(TOC_LESSON),
      lessonStrings: [
        metaString(TITLE_MASTER_ID, "/office:document-meta/office:meta/dc:title/text()"),
        metaString(SUBJECT_MASTER_ID, "/office:document-meta/office:meta/dc:subject/text()"),
      ],
    };
  }

  let workDir: string;
  let outputPath: string;
  let stylesXml: string;
  let footerText: string;
  let fullText: string;
  const generatedTmpPaths: string[] = [];

  beforeAll(async () => {
    assertLibreOfficeSupported(execFileSync("soffice", ["--version"]).toString());
    execFileSync("pdftotext", ["-v"]);

    // `makeLessonFile` writes each translated constituent into docStorage's
    // tmp dir (`docStorage.docsDirPath() + "/tmp"`, the seeded disposable run
    // dir under NODE_ENV=test), outside workDir — record them so afterAll can
    // remove them.
    const realTmpFilePath = docStorage.tmpFilePath;
    jest.spyOn(docStorage, "tmpFilePath").mockImplementation((baseName: string) => {
      const generated = realTmpFilePath(baseName);
      generatedTmpPaths.push(generated);
      return generated;
    });

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-footers-"));
    const workRoot = path.join(workDir, "assembly-work");
    fs.mkdirSync(workRoot, { recursive: true });

    outputPath = await assembleQuarter({
      storage: translatedStorage,
      lessons: [
        tocLessonWithMetaStrings(),
        ...LESSON_NUMBERS.map((n) => ({ ...lesson(n), lessonStrings: [] })),
      ],
      motherLang: translatedLang,
      majorityLangId: TRANSLATED_LANGUAGE_ID,
      jobId: "translated-footers",
      workRoot,
    });

    stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-footers");
    footerText = (stylesXml.match(/<style:footer>[\s\S]*?<\/style:footer>/g) ?? []).join("\n");

    const pdfPath = convertToPdf(outputPath, workDir, path.join(workDir, "pdf-profile"));
    fullText = pdfToText(pdfPath);
  });

  afterAll(() => {
    jest.restoreAllMocks();
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    if (outputPath) fs.rmSync(outputPath, { force: true });
    generatedTmpPaths.splice(0).forEach((generated) => fs.rmSync(generated, { force: true }));
  });

  test("the delivered book's footers carry the translated words, not the template's English ones", () => {
    expect(footerText).toContain(TRANSLATED_QUARTER);
    expect(footerText).toContain(TRANSLATED_LESSON);
    expect(footerText).toContain(TRANSLATED_PAGE);
    expect(footerText).not.toContain(">Quarter<");
    expect(footerText).not.toContain(">Lesson<");
  });

  test("the hard-coded book title and guide subtitle are gone from the footers (both apostrophe spellings)", () => {
    expect(footerText).toContain(TRANSLATED_TITLE);
    expect(footerText).toContain(TRANSLATED_SUBJECT);
    expect(footerText).not.toContain("Lessons from Luke");
    expect(footerText).not.toContain("Teacher’s Guide");
    expect(footerText).not.toContain("Teacher&apos;s Guide");
  });

  test("the book-level metadata the live title/subject fields resolve against is translated too", () => {
    const metaXml = execFileSync("unzip", ["-p", outputPath, "meta.xml"], { encoding: "utf8" });

    expect(metaXml).toContain(`<dc:title>${TRANSLATED_TITLE}</dc:title>`);
    expect(metaXml).toContain(`<dc:subject>${TRANSLATED_SUBJECT}</dc:subject>`);
  });

  test("the translated footer words actually RENDER — the live chapter/page fields still resolve beside them", () => {
    expect(fullText).toContain(TRANSLATED_QUARTER);
    expect(fullText).toContain(TRANSLATED_LESSON);
    // The per-lesson live chapter-number field still resolves next to the
    // translated word, exactly as the English footer marker does.
    LESSON_NUMBERS.forEach((n) => {
      expect(fullText).toContain(`${TRANSLATED_LESSON} ${n}`);
    });
  });
});
