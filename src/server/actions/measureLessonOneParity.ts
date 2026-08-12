import fs from "fs";
import path from "path";
import { spawn, execFile, type ChildProcess } from "child_process";
import { PDF_CONVERT_TO_TARGET, reconcilePdfPages, classifyPage } from "./pdfRenderOptions";

/**
 * measureLessonOneParity — renders a finalized quarter book to PDF and
 * locates lesson 1's first physical page so the caller can decide whether a
 * blank recto filler is required (US3, FR-010).
 * See contracts/pagination-and-assembly.md §3.
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
 * Hard per-render self-kill budget. A single-document PDF export is far
 * cheaper than the 14-document `soffice` merge `sofficeAssemble.ts` bounds
 * (`DEFAULT_TIMEOUT_MS`), so this is deliberately a fraction of it — see
 * plan.md §5 for the eventual `ASSEMBLY_RENDER_TIMEOUT_MS` budget-sum term
 * this constant feeds once the orchestration task wires it in.
 */
export const MEASURE_RENDER_TIMEOUT_MS = 90_000;

/**
 * Builds the `soffice --convert-to` argument array for the measurement
 * render. Pure — no spawning — so it is unit-testable on its own (contract
 * §3 "render pinning" + "profileDir is a parameter, never re-derived").
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
    `-env:UserInstallation=file://${options.profileDir}`,
    "--convert-to",
    PDF_CONVERT_TO_TARGET,
    "--outdir",
    options.outDir,
    options.odtPath,
  ];
}

/**
 * The `ASSEMBLY_RECTO_FILLER` operational kill-switch predicate (contract §4
 * "Switch shape"). Default ON. Only an explicit, EXACT (case-insensitive,
 * unpadded) `"off"` / `"false"` / `"0"` disables it — every other value,
 * including unset, empty, or a typo/padded near-miss, keeps the guarantee
 * rather than silently shipping without it. Read fresh from `process.env` on
 * every call — never module-load-cached — so both branches are testable
 * without module-cache manipulation.
 */
export function isRectoFillerEnabled(): boolean {
  const raw = process.env.ASSEMBLY_RECTO_FILLER;
  if (raw === undefined) return true;
  return !["off", "false", "0"].includes(raw.toLowerCase());
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
 * the first lesson's marker). Scans the entire book — never stops at the
 * first lesson-title-class candidate — and throws when zero or more than
 * one page satisfies the conjunction, rather than guessing.
 */
export function locateLessonOnePage(
  pages: string[],
  series: number,
  firstLessonNumber: number
): number {
  const marker = firstLessonMarker(series, firstLessonNumber);
  const matches: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    if (classifyPage(pages[i]) !== "lesson-title") continue;

    // Confirmation A: the NEXT page belongs to the quarter's first lesson —
    // coloring or content class, marker matched on a whole-token boundary.
    const nextPage = pages[i + 1];
    if (nextPage === undefined || !marker.test(nextPage)) continue;
    const nextClass = classifyPage(nextPage);
    if (nextClass !== "coloring" && nextClass !== "lesson-content") continue;

    // Confirmation B (a DENIAL, not an allow-list): the PRECEDING page is
    // absent, or does not carry the first lesson's marker.
    const prevPage = pages[i - 1];
    if (prevPage !== undefined && marker.test(prevPage)) continue;

    matches.push(i + 1);
  }

  if (matches.length !== 1) {
    throw new MeasureLessonOneParityError("could not locate lesson 1's opening page");
  }
  return matches[0];
}

/** `lessonOnePageIndex` even → lesson 1 opens verso and needs a filler (contract §3). */
export function needsFillerForIndex(lessonOnePageIndex: number): boolean {
  return lessonOnePageIndex % 2 === 0;
}

/**
 * Asserts the pass-tagged `outDir` holds no stale PDF for `odtPath` before
 * this pass renders into it — a stale PDF from a prior pass must never be
 * silently read as the current result (contract §3 "invocation discipline").
 * Unlinks it if present; a missing file is not an error.
 */
export function assertFreshPdfOutput(pdfPath: string): void {
  try {
    fs.unlinkSync(pdfPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
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
 */
export async function pollProcessGroupExited(
  checkExited: () => boolean,
  capMs: number,
  intervalMs = 100
): Promise<boolean> {
  const start = Date.now();
  if (checkExited()) return true;

  while (Date.now() - start < capMs) {
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    if (checkExited()) return true;
  }
  return false;
}

/**
 * Distinct server-side log line depending on WHO killed the render's process
 * group — this pass's own timeout/abort, vs. an externally-caused signal
 * death (e.g. the OOM killer) it did not send. Diagnostics-only; the
 * coordinator-facing curated reason is unaffected.
 */
export function renderKillLogLine(killedByUs: boolean): string {
  return killedByUs
    ? `measureLessonOneParity: soffice render process group killed by us at MEASURE_RENDER_TIMEOUT_MS (our own timeout/abort)`
    : `measureLessonOneParity: soffice render process group died by a signal this process did not send (e.g. the OOM killer)`;
}

/**
 * Run the full render-then-locate flow for one measurement or confirmation
 * pass. Follows `sofficeAssemble.ts`'s invocation discipline, NOT
 * `webifyLesson.ts`'s (the in-repo anti-pattern: shell `exec` with an
 * interpolated path and a shared default profile) — array-arg `spawn`,
 * detached so a process-group kill can target the whole tree, self-killed on
 * timeout, and honouring an `AbortSignal`. See the module doc comment and
 * contract §3.
 */
export function measureLessonOneParity(
  options: MeasureLessonOneParityOptions
): Promise<LessonOneParity> {
  const { odtPath, outDir, profileDir, series, firstLessonNumber, signal } = options;

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

    const pdfPath = pdfPathFor(odtPath, outDir);
    assertFreshPdfOutput(pdfPath);

    const args = buildMeasureConvertArgs({ odtPath, outDir, profileDir });

    let settled = false;

    /** The single settle funnel: every exit path clears the timer and drops the abort listener exactly once. */
    function finish(act: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      act();
    }

    /** Kill the live render's process group, swallowing any failure (a hung `soffice` must not wedge this promise). */
    function killGroup(killedByUs: boolean): void {
      console.warn(renderKillLogLine(killedByUs));
      if (!child.pid) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (err) {
        console.warn("measureLessonOneParity: process-group kill failed", err);
      }
    }

    function onAbort(): void {
      finish(() => {
        killGroup(true);
        reject(new MeasureLessonOneParityAbortedError());
      });
    }
    signal?.addEventListener("abort", onAbort);

    const timer = setTimeout(() => {
      finish(() => {
        killGroup(true);
        reject(new MeasureLessonOneParityTimeoutError());
      });
    }, MEASURE_RENDER_TIMEOUT_MS);

    const child: ChildProcess = spawn("soffice", args, { detached: true });

    child.on("error", (err) => {
      finish(() => reject(err));
    });

    child.on("close", (code, killedBySignal) => {
      // Our own timeout/abort kill already settled and rejected via
      // `finish` — this guard keeps the close event from double-handling.
      if (settled) return;

      if (code !== 0) {
        finish(() => {
          // A signal death this process did not send (e.g. the OOM killer)
          // reads distinctly from an ordinary non-zero exit.
          if (killedBySignal) {
            console.warn(renderKillLogLine(false));
          }
          reject(new MeasureLessonOneParityError("lesson-one parity render failed"));
        });
        return;
      }

      execFile("pdfinfo", [pdfPath], { encoding: "utf8" }, (infoErr, infoOut) => {
        if (settled) return;
        if (infoErr) {
          finish(() =>
            reject(
              new MeasureLessonOneParityError("lesson-one parity render produced no readable PDF")
            )
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
            if (settled) return;
            if (textErr) {
              finish(() =>
                reject(
                  new MeasureLessonOneParityError(
                    "lesson-one parity render produced no extractable text"
                  )
                )
              );
              return;
            }
            finish(() => {
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
            });
          }
        );
      });
    });
  });
}
