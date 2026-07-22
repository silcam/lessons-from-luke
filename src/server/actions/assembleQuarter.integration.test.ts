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
import { Persistence } from "../../core/interfaces/Persistence";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { Lesson, TOC_LESSON, COVER_A4_LESSON, COVER_A3_LESSON } from "../../core/models/Lesson";
import {
  expectedLessonNumbers,
  isCompleteQuarter,
  missingQuarterParts,
} from "../../core/models/Quarter";
import assembleQuarter from "./assembleQuarter";
import { selectAssemblyConstituents } from "../controllers/assemblyController";

// The real merge (~14 `soffice` inserts + a `--convert-to pdf` verification
// pass) comfortably exceeds Jest's 5s default. `sofficeAssemble`'s own hard
// timeout is 100s; give the whole test generous headroom beyond that.
jest.setTimeout(280_000);

const BOOK = "Luke";
const SERIES = 2;
const LESSON_NUMBERS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
/** TOC first, then the 13 lessons ascending — the contractual assembly order. */
const ORDERED_LESSON_NUMBERS = [TOC_LESSON, ...LESSON_NUMBERS];

const SERVER_DOCS_DIR = path.join(process.cwd(), "test", "docs", "serverDocs");

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
      "pdf",
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

/** The printed page-number footer token on a page, e.g. `"14"` from `"...  Page 14"`, or `undefined` if the page carries no page-number footer (front matter's own first page, and every lesson's own first page — FR-003 suppression). */
function pageNumberFooterOn(pageText: string): string | undefined {
  const matches = [...pageText.matchAll(/\bPage\s+(\S+)/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : undefined;
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
    execFileSync("soffice", ["--version"]);
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
  });

  test("source-immutability guard (Pass 6, MANDATORY): every constituent source is byte-identical after assembly", () => {
    ORDERED_LESSON_NUMBERS.forEach((n) => {
      const srcPath = sourcePathFor(n);
      expect(fs.existsSync(srcPath)).toBe(true);
      expect(sha256(srcPath)).toBe(sourceHashesBefore.get(n));
    });
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
      const firstContentPageIndex = pages.findIndex((pageText) => pageText.includes(marker));
      expect(firstContentPageIndex).toBeGreaterThan(0);

      const titlePageIndex = firstContentPageIndex - 1;
      expect(pageNumberFooterOn(pages[titlePageIndex])).toBeUndefined();
    });
  });

  test("single clean master-page set: every display name appears ONCE and none carries a numeric constituent suffix (the duplicated-page-styles defect this fix removes)", () => {
    const extractDir = path.join(workDir, "styles-extract");
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", outputPath, "styles.xml", "-d", extractDir]);
    const stylesXml = fs.readFileSync(path.join(extractDir, "styles.xml"), "utf8");

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

  test("outline numbering: the merged book's level-1 outline style starts at the quarter's first absolute lesson number (14), so chapter-number footer fields render", () => {
    const extractDir = path.join(workDir, "styles-extract-outline");
    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync("unzip", ["-o", "-q", outputPath, "styles.xml", "-d", extractDir]);
    const stylesXml = fs.readFileSync(path.join(extractDir, "styles.xml"), "utf8");

    const level1 = /<text:outline-level-style text:level="1"[^>]*>/.exec(stylesXml)?.[0];
    expect(level1).toBeDefined();
    expect(level1).toContain('style:num-format="1"');
    expect(level1).toContain(`text:start-value="${(SERIES - 1) * 13 + 1}"`);
  });

  test("page-offset parity: the produced book's final printed page number carries the known +1 offset vs. physical PDF page count (research.md R3 — matched, not fixed)", () => {
    const pdfPath = path.join(workDir, "pdf-out", `${path.basename(outputPath, ".odt")}.pdf`);
    const physicalPageCount = pdfPageCount(pdfPath);

    const numberedPages = pages
      .map(pageNumberFooterOn)
      .filter((token): token is string => token !== undefined && /^\d+$/.test(token))
      .map((token) => parseInt(token, 10));
    const finalPrintedPageNumber = numberedPages[numberedPages.length - 1];

    expect(finalPrintedPageNumber).toBe(physicalPageCount + 1);
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
    execFileSync("soffice", ["--version"]);
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
