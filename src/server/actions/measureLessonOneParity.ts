import fs from "fs";
import path from "path";
import { spawn, execFile, type ChildProcess } from "child_process";
import { reconcilePdfPages, classifyPage } from "./pdfRenderOptions";

/**
 * measureLessonOneParity — renders a finalized quarter book to PDF and
 * locates lesson 1's first physical page so the caller can decide whether a
 * blank recto filler is required (US3, FR-010).
 * See contracts/pagination-and-assembly.md §3.
 *
 * STUB (US3-T1 RED): the shapes below satisfy the signature so the RED test
 * file compiles and typechecks, but none of the behavior is implemented yet
 * — US3-T2 (GREEN) fills this in. Every exported function here is
 * deliberately wrong/naive so the RED suite fails on assertions, not on
 * "Cannot find module" or a TypeScript error.
 */

/** Options for {@link measureLessonOneParity}. See contract §3 for "the two path parameters". */
export interface MeasureLessonOneParityOptions {
  /** Absolute path to the finalized `.odt` to render and measure. */
  odtPath: string;
  /**
   * Pass-scoped render output directory — the caller sites this inside the
   * job's own working directory so the existing `finally` cleanup reaps it.
   * NOT derived from `odtPath`: both the measurement and confirmation
   * renders read the SAME `odtPath`, so only a caller-supplied `outDir`
   * keeps their outputs distinct.
   */
  outDir: string;
  /**
   * The merge's already-warmed per-job profile — `profileDirFor(workRoot,
   * jobId)`, threaded in by the caller. Never re-derived here.
   */
  profileDir: string;
  /** The quarter series number, used to build the first-lesson marker. */
  series: number;
  /** `(series - 1) * 13 + 1` — the quarter's first absolute lesson number. */
  firstLessonNumber: number;
  /** Cancellation channel — an abort kills the render's process group. */
  signal?: AbortSignal;
}

/** Result of {@link measureLessonOneParity}. See contract §3. */
export interface LessonOneParity {
  /** 1-based physical index of lesson 1's first page in the rendered PDF. */
  lessonOnePageIndex: number;
  /** True when `lessonOnePageIndex` is even — lesson 1 would open verso. */
  needsFiller: boolean;
  /** Total rendered pages, recorded for diagnostics. */
  renderedPageCount: number;
}

/**
 * Fixed-vocabulary, path-free error for every failure mode this module
 * throws — render failure, reconciliation mismatch, or an unlocatable
 * lesson-1 page. Never carries an absolute filesystem path or extracted page
 * text (contract §3 "Diagnostics").
 */
export class MeasureLessonOneParityError extends Error {}

/** Fixed-vocabulary error for a render or process-group wait that exceeded its budget. */
export class MeasureLessonOneParityTimeoutError extends MeasureLessonOneParityError {
  constructor() {
    super("lesson-one parity measurement timed out");
    this.name = "MeasureLessonOneParityTimeoutError";
  }
}

/** Fixed-vocabulary error for an aborted measurement. */
export class MeasureLessonOneParityAbortedError extends MeasureLessonOneParityError {
  constructor() {
    super("lesson-one parity measurement was cancelled");
    this.name = "MeasureLessonOneParityAbortedError";
  }
}

/**
 * Builds the `soffice --convert-to` argument array for the measurement
 * render. Pure — no spawning — so it is unit-testable on its own (contract
 * §3 "render pinning" + "profileDir is a parameter, never re-derived").
 *
 * STUB (RED): omits {@link PDF_CONVERT_TO_TARGET} and hardcodes a bare `pdf`
 * target, and ignores the passed `profileDir` in favor of a fake default —
 * both wrong on purpose so the RED assertions fail cleanly.
 */
export function buildMeasureConvertArgs(options: {
  odtPath: string;
  outDir: string;
  profileDir: string;
}): string[] {
  return [
    "--headless",
    "--norestore",
    "--nologo",
    "-env:UserInstallation=file:///tmp/STUB-default-profile-not-yet-implemented",
    "--convert-to",
    "pdf",
    "--outdir",
    options.outDir,
    options.odtPath,
  ];
}

/** `Quarter <series> Lesson <firstLessonNumber>`, on whole-token boundaries — never the literal string `Lesson 1`. */
export function firstLessonMarker(series: number, firstLessonNumber: number): RegExp {
  return new RegExp(`\\bQuarter\\s+${series}\\s+Lesson\\s+${firstLessonNumber}\\b`);
}

/**
 * The pure locator (contract §3 "Rule", INV-14): the index (1-based) of the
 * FIRST page satisfying the whole conjunction — lesson-title class AND
 * confirmation A (the next page belongs to the quarter's first lesson) AND
 * confirmation B (a denial: the preceding page is absent, or does not carry
 * the first lesson's marker). Scans the entire book; throws when zero or
 * more than one page satisfies the conjunction.
 *
 * STUB (RED): implements the explicitly-rejected "first-then-check" +
 * marker-adjacency shortcuts the contract calls out as unsafe, so the RED
 * suite's dedicated rejection tests fail cleanly.
 */
export function locateLessonOnePage(
  pages: string[],
  series: number,
  firstLessonNumber: number
): number {
  // STUB: neither `series` nor `firstLessonNumber` is consulted — see
  // {@link firstLessonMarker} for the real marker this STUB ignores.
  void series;
  void firstLessonNumber;
  // STUB: "first-then-check" — selects the first lesson-title-class page
  // without checking either confirmation, which is exactly the unsafe
  // shortcut the contract forbids (it selects the book's own physical
  // page 1).
  for (let i = 0; i < pages.length; i++) {
    if (classifyPage(pages[i]) === "lesson-title") {
      return i + 1;
    }
  }
  throw new MeasureLessonOneParityError("could not locate lesson 1's opening page");
}

/** `lessonOnePageIndex` even → lesson 1 opens verso and needs a filler (contract §3). */
export function needsFillerForIndex(lessonOnePageIndex: number): boolean {
  return lessonOnePageIndex % 2 === 0;
}

/**
 * Asserts the pass-tagged `outDir` holds no stale PDF for `odtPath` before
 * this pass renders into it — a stale PDF from a prior pass must never be
 * silently read as the current result (contract §3 "invocation discipline").
 * Unlinks it if present.
 *
 * STUB (RED): no-ops, so a stale PDF is silently left in place.
 */
export function assertFreshPdfOutput(_pdfPath: string): void {
  // STUB — does nothing.
}

/** The PDF path `soffice --convert-to` derives from `odtPath`'s basename inside `outDir`. */
export function pdfPathFor(odtPath: string, outDir: string): string {
  return path.join(outDir, `${path.basename(odtPath, ".odt")}.pdf`);
}

/**
 * Bounded ("capped") poll for the previous `soffice` process group having
 * exited, per contract §4's "Bounded wait" — never an open await. Resolves
 * `true` once `checkExited()` reports the group is gone, or `false` once
 * `capMs` elapses first.
 *
 * STUB (RED): resolves immediately without ever calling `checkExited`, so
 * the RED suite's dedicated poll-shape tests fail cleanly.
 */
export async function pollProcessGroupExited(
  _checkExited: () => boolean,
  _capMs: number,
  _intervalMs = 100
): Promise<boolean> {
  return true;
}

/**
 * Distinct server-side log line depending on WHO killed the render's process
 * group — this pass's own timeout/abort, vs. an externally-caused signal
 * death (e.g. the OOM killer) it did not send. Diagnostics-only; the
 * coordinator-facing curated reason is unaffected.
 *
 * STUB (RED): both branches produce the same string.
 */
export function renderKillLogLine(_killedByUs: boolean): string {
  return "soffice render was killed";
}

/**
 * Run the full render-then-locate flow for one measurement or confirmation
 * pass. See the module doc comment and contract §3 for the full contract
 * this MUST satisfy once implemented.
 *
 * STUB (US3-T1 RED): spawns nothing resembling the real invocation
 * discipline yet — a minimal, deliberately-wrong placeholder so the RED
 * suite's mocked-spawn assertions fail cleanly rather than the whole file
 * failing to import.
 */
export function measureLessonOneParity(
  options: MeasureLessonOneParityOptions
): Promise<LessonOneParity> {
  const { odtPath, outDir, series, firstLessonNumber, signal } = options;

  return new Promise<LessonOneParity>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new MeasureLessonOneParityAbortedError());
      return;
    }

    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch {
      reject(new MeasureLessonOneParityError("failed to prepare the measurement render directory"));
      return;
    }

    const args = buildMeasureConvertArgs({ odtPath, outDir, profileDir: options.profileDir });
    // STUB: not detached, no process-group kill wiring, no timeout — every
    // one of the RED suite's invocation-discipline assertions is expected
    // to fail against this.
    const child: ChildProcess = spawn("soffice", args);

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new MeasureLessonOneParityError("lesson-one parity render failed"));
        return;
      }
      const pdfPath = pdfPathFor(odtPath, outDir);
      execFile("pdfinfo", [pdfPath], { encoding: "utf8" }, (infoErr, infoOut) => {
        if (infoErr) {
          reject(
            new MeasureLessonOneParityError("lesson-one parity render produced no readable PDF")
          );
          return;
        }
        const match = /^Pages:\s+(\d+)/m.exec(infoOut);
        const renderedPageCount = match ? parseInt(match[1], 10) : 0;
        execFile(
          "pdftotext",
          ["-layout", pdfPath, "-"],
          { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
          (textErr, textOut) => {
            if (textErr) {
              reject(
                new MeasureLessonOneParityError(
                  "lesson-one parity render produced no extractable text"
                )
              );
              return;
            }
            try {
              const pages = reconcilePdfPages(textOut, renderedPageCount);
              const lessonOnePageIndex = locateLessonOnePage(pages, series, firstLessonNumber);
              resolve({
                lessonOnePageIndex,
                needsFiller: needsFillerForIndex(lessonOnePageIndex),
                renderedPageCount,
              });
            } catch {
              reject(new MeasureLessonOneParityError("could not locate lesson 1's opening page"));
            }
          }
        );
      });
    });
  });
}
