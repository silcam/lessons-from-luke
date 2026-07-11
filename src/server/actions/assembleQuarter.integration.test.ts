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
import { Lesson, TOC_LESSON } from "../../core/models/Lesson";
import assembleQuarter from "./assembleQuarter";
import * as quarterStylesTemplate from "../assembly/quarterStylesTemplate";

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

/** Extracts and reads `styles.xml` from the assembled book into a fresh subdir of `workDir` — shared by the styles/outline assertions below, each of which needs its own extraction target to avoid clobbering a concurrently-running unzip. */
function extractStylesXml(outputPath: string, workDir: string, subdir: string): string {
  const extractDir = path.join(workDir, subdir);
  fs.mkdirSync(extractDir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", outputPath, "styles.xml", "-d", extractDir]);
  return fs.readFileSync(path.join(extractDir, "styles.xml"), "utf8");
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

  test("outline numbering: the merged book's level-1 outline style starts at the quarter's first absolute lesson number (14), so chapter-number footer fields render", () => {
    const stylesXml = extractStylesXml(outputPath, workDir, "styles-extract-outline");

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

describe("assembleQuarter (real soffice merge, corrupt-template fail-loud — 009 US2/FR-004, contracts/template-application.md §5)", () => {
  // A PRESENT, non-empty, but unreadable template — distinct from a MISSING
  // one (which `validateTemplateAsset`'s existence/size gate already
  // catches, unit-tested elsewhere without soffice). This deliberately
  // corrupt fixture is separate from the real shipped
  // `assets/quarter-styles-template.odt` baseline — it is never touched.
  let workDir: string;
  let corruptTemplatePath: string;

  beforeAll(() => {
    execFileSync("soffice", ["--version"]);

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
