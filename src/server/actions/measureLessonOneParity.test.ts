/// <reference types="jest" />

/**
 * measureLessonOneParity.test.ts — RED tests (US3-T1) for the new
 * `measureLessonOneParity` module: the locator conjunction (INV-14/15/16),
 * the page classifier reuse, and the invocation-discipline / diagnostics
 * requirements contract §3 states. See contracts/pagination-and-assembly.md
 * §3, data-model.md INV-11, INV-14, INV-15, INV-16.
 *
 * These are unit tests: `child_process` is mocked throughout (real
 * `soffice`/`pdftotext`/`pdfinfo` invocation is covered by the integration
 * suite once US3-T7 lands). The module under test does not exist with real
 * behavior yet — `measureLessonOneParity.ts` today is a deliberately-wrong
 * STUB (see its module doc comment) so this file typechecks and fails on
 * assertions, not on "Cannot find module".
 */

jest.mock("child_process", () => ({
  spawn: jest.fn(),
  execFile: jest.fn(),
}));

import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, execFile } from "child_process";
import { PDF_CONVERT_TO_TARGET } from "./pdfRenderOptions";
import {
  buildMeasureConvertArgs,
  locateLessonOnePage,
  needsFillerForIndex,
  assertFreshPdfOutput,
  pdfPathFor,
  pollProcessGroupExited,
  renderKillLogLine,
  measureLessonOneParity,
  MeasureLessonOneParityError,
} from "./measureLessonOneParity";

/** Minimal fake `ChildProcess`: an EventEmitter with a `pid` and no-op `stdout`/`stderr`. */
class FakeChildProcess extends EventEmitter {
  pid: number;
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

const spawnMock = spawn as unknown as jest.Mock;
const execFileMock = execFile as unknown as jest.Mock;

afterEach(() => {
  spawnMock.mockReset();
  execFileMock.mockReset();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. Render pinning (contract §3, IsSkipEmptyPages via the shared F2b helper)
// ---------------------------------------------------------------------------

describe("buildMeasureConvertArgs (contract §3, render pinning)", () => {
  test("the --convert-to target is PDF_CONVERT_TO_TARGET itself — the shared F2b helper, not a duplicated literal", () => {
    const args = buildMeasureConvertArgs({
      odtPath: "/job/00.odt",
      outDir: "/job/pdf-out-measure",
      profileDir: "/job/profile",
    });
    const idx = args.indexOf("--convert-to");
    expect(idx).toBeGreaterThan(-1);
    // Must be the imported constant's CURRENT value, not a coincidentally
    // matching bare "pdf" — proves the render reuses F2b's single filter
    // builder rather than re-deriving its own.
    expect(args[idx + 1]).toBe(PDF_CONVERT_TO_TARGET);
  });

  // -------------------------------------------------------------------------
  // 2. profileDir is a parameter, never re-derived
  // -------------------------------------------------------------------------

  test("-env:UserInstallation uses the passed profileDir — the merge's already-warmed per-job profile, never a shared default", () => {
    const args = buildMeasureConvertArgs({
      odtPath: "/job/00.odt",
      outDir: "/job/pdf-out-measure",
      profileDir: "/docs/assembly-work/job-abc/profile",
    });
    const envArg = args.find((a) => a.startsWith("-env:UserInstallation="));
    expect(envArg).toBe("-env:UserInstallation=file:///docs/assembly-work/job-abc/profile");
  });

  test("outDir is threaded through --outdir, not derived from odtPath", () => {
    const args = buildMeasureConvertArgs({
      odtPath: "/job/00.odt",
      outDir: "/job/pdf-out-confirm",
      profileDir: "/job/profile",
    });
    const idx = args.indexOf("--outdir");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("/job/pdf-out-confirm");
  });
});

// ---------------------------------------------------------------------------
// 3. outDir is pass-tagged, not derived from odtPath — freshness
// ---------------------------------------------------------------------------

describe("assertFreshPdfOutput / pdfPathFor (contract §3, per-pass freshness)", () => {
  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "measureLessonOneParity-fresh-"));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  test("a stale PDF left over from a prior pass is unlinked before the render, never silently read as the current result", () => {
    const stalePdf = path.join(workDir, "00.pdf");
    fs.writeFileSync(stalePdf, "stale pdf bytes from a prior pass");
    expect(fs.existsSync(stalePdf)).toBe(true);

    assertFreshPdfOutput(stalePdf);

    expect(fs.existsSync(stalePdf)).toBe(false);
  });

  test("each pass derives its own output path from its OWN outDir, since --convert-to names the file from the input basename", () => {
    const measurePath = pdfPathFor("/job/assembled.odt", "/job/pdf-out-measure");
    const confirmPath = pdfPathFor("/job/assembled.odt", "/job/pdf-out-confirm");
    // Same odtPath (the re-finalize rewrites it in place) — only distinct
    // outDirs keep the two passes' output paths from colliding.
    expect(measurePath).not.toBe(confirmPath);
    expect(measurePath).toBe(path.join("/job/pdf-out-measure", "assembled.pdf"));
    expect(confirmPath).toBe(path.join("/job/pdf-out-confirm", "assembled.pdf"));
  });
});

// ---------------------------------------------------------------------------
// 4-6. Locator conjunction (INV-14), scan-don't-stop, marker-adjacency rejection
// ---------------------------------------------------------------------------

describe("locateLessonOnePage (contract §3 Rule, INV-14/15/16)", () => {
  const SERIES = 2;
  const FIRST_LESSON = 14;

  /** A lesson-content-class footer for the quarter's first lesson (present once, plus a page number). */
  const CONTENT_PAGE = "Quarter 2  Lesson 14  The Prodigal Son  Page 5";
  /** A coloring-class footer: the marker present TWICE, no page number. */
  const COLORING_PAGE =
    "Lessons from Luke  Quarter 2  Lesson 14  Lessons from Luke  Quarter 2  Lesson 14";
  /** No footer at all, but real body text — a lesson's own suppressed-footer title page. */
  const TITLE_PAGE = "The Prodigal Son\n\nOnce there was a man who had two sons...";
  /** Front matter: Quarter <Q> alone (no Lesson <N>), has a page number. */
  const FRONT_MATTER_PAGE = "Lessons from Luke  Teacher's Guide – Quarter 2 Page 3";
  /** No extractable text at all after trim. */
  const BLANK_PAGE = "   \n  \n";
  /** A footer-less-but-texted front-matter page (e.g. Inside_20_cover) — same class as a lesson title page. */
  const COVER_PAGE = "Inside front cover artwork caption text with no footer at all";

  test("selects the lesson-title-class page whose NEXT page carries the first lesson's marker, and whose PRECEDING page does not", () => {
    // page 0 = the book's own physical page 1 (also lesson-title class, but
    // its next page is front matter, not the first lesson) — a decoy the
    // scan must reject.
    const pages = [TITLE_PAGE, FRONT_MATTER_PAGE, COVER_PAGE, TITLE_PAGE, CONTENT_PAGE];
    const index = locateLessonOnePage(pages, SERIES, FIRST_LESSON);
    // 1-based physical index of pages[3] (the real lesson-1 title page).
    expect(index).toBe(4);
  });

  test("scan, don't stop at first match — the book's own physical page 1 is ALSO lesson-title class and must not be selected", () => {
    // page 0 is lesson-title class, but its successor is NOT the first
    // lesson (it's front matter) — a first-then-check rule would select
    // page 0, fail confirmation A, and throw. The correct rule scans past it
    // to the real candidate at index 3.
    const pages = [TITLE_PAGE, FRONT_MATTER_PAGE, COVER_PAGE, TITLE_PAGE, CONTENT_PAGE];
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).not.toThrow();
    expect(locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toBe(4);
  });

  test("marker adjacency is explicitly rejected: 'first marker page, then check predecessor prints no number' would wrongly select a coloring page", () => {
    // The coloring page carries the marker and prints no number — the exact
    // shape "first page carrying the marker" + "predecessor prints no
    // number" resolves to. Here the coloring page (index 1) sits right
    // after the real title page (index 0), so a marker-adjacency rule finds
    // the marker first at index 1 (the coloring page itself, which also
    // satisfies "carries the marker") and never reaches the correct
    // lesson-title candidate the conjunction rule (title class + successor
    // carries marker + predecessor does not) correctly selects.
    const pages = [TITLE_PAGE, COLORING_PAGE, CONTENT_PAGE];
    const index = locateLessonOnePage(pages, SERIES, FIRST_LESSON);
    expect(index).toBe(1);
    expect(index).not.toBe(2); // 2 = the coloring page's own 1-based index
  });

  test("confirmation B is a DENIAL, not an allow-list — a footer-less-but-texted predecessor (e.g. Inside_20_cover) must not cause a throw", () => {
    // An allow-list phrasing ("predecessor is absent/blank/front-matter/TOC")
    // rejects this shape, because COVER_PAGE is none of those — it is its
    // own footer-less, texted class, indistinguishable from a title page by
    // class alone. The denial phrasing ("absent OR does not carry the
    // marker") correctly accepts it, since it carries no marker at all.
    const pages = [FRONT_MATTER_PAGE, COVER_PAGE, TITLE_PAGE, CONTENT_PAGE];
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).not.toThrow();
    expect(locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toBe(3);
  });

  test("confirmation B rejects a candidate whose predecessor DOES carry the first lesson's marker — it sits inside the lesson, not at its start", () => {
    const insideLessonTitleLike = "A mid-lesson footer-less illustration page with body text";
    const pages = [CONTENT_PAGE, insideLessonTitleLike, CONTENT_PAGE];
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toThrow(
      MeasureLessonOneParityError
    );
  });

  test("whole-token marker matching: 'Lesson 1' must not match inside 'Lesson 14' as a false confirmation A", () => {
    const decoyNextPage = "Quarter 2  Lesson 26  Some other lesson's content  Page 40";
    const pages = [TITLE_PAGE, decoyNextPage];
    // decoyNextPage carries "Lesson 26", which contains "Lesson 2" — but the
    // locator is built from firstLessonNumber (14), not a substring probe,
    // so this must NOT satisfy confirmation A.
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toThrow(
      MeasureLessonOneParityError
    );
  });

  test("exactly one page must satisfy the conjunction — a SECOND matching candidate throws rather than returning the first", () => {
    const pages = [TITLE_PAGE, CONTENT_PAGE, BLANK_PAGE, TITLE_PAGE, CONTENT_PAGE];
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toThrow(
      MeasureLessonOneParityError
    );
  });

  test("no page satisfying the conjunction throws the curated reason rather than guessing", () => {
    const pages = [FRONT_MATTER_PAGE, FRONT_MATTER_PAGE, BLANK_PAGE];
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toThrow(
      MeasureLessonOneParityError
    );
  });

  test("the blank class is not mistaken for lesson-title class (blank must never satisfy the conjunction as a candidate)", () => {
    const pages = [BLANK_PAGE, CONTENT_PAGE];
    expect(() => locateLessonOnePage(pages, SERIES, FIRST_LESSON)).toThrow(
      MeasureLessonOneParityError
    );
  });
});

// ---------------------------------------------------------------------------
// 7. needsFiller parity
// ---------------------------------------------------------------------------

describe("needsFillerForIndex (contract §3, needsFiller = lessonOnePageIndex is even)", () => {
  test.each([
    [1, false],
    [2, true],
    [3, false],
    [4, true],
    [13, false],
    [14, true],
  ])("index %i -> needsFiller %s", (index, expected) => {
    expect(needsFillerForIndex(index)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 8. FR-010 — no ODF counter
// ---------------------------------------------------------------------------

describe("FR-010 (contract §3): every returned value derives from the rendered PDF only", () => {
  test("the module never imports an ODF/page-counter or constituent-summation helper", () => {
    const source = fs.readFileSync(path.join(__dirname, "measureLessonOneParity.ts"), "utf8");
    // No dependence on ODF-internal page counters or a sum of constituent
    // page counts — only pdfinfo's renderedPageCount and pdftotext's
    // extraction may participate, per FR-010.
    expect(source).not.toMatch(/expectedLessonNumbers|constituentMeta|ConstituentMeta/);
    expect(source).not.toMatch(/office:document-styles|meta:page-count/);
  });

  test("renderedPageCount in the result is not the sum of constituent page counts (a real render-derived count is not a multiple-of-14 artifact by construction)", () => {
    // Structural assertion on the shape of LessonOneParity's producer: the
    // only inputs to measureLessonOneParity are a single rendered odtPath, a
    // profile, and an outDir — never a list of constituents or their counts.
    expect(measureLessonOneParity.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. Diagnostics hygiene
// ---------------------------------------------------------------------------

describe("diagnostics hygiene (contract §3)", () => {
  test("extracted page text is never passed to console.log/warn/error", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    const renderChild = new FakeChildProcess(555);
    spawnMock.mockImplementationOnce(() => renderChild);
    const secretPageText = "UNPUBLISHED TRANSLATION CONTENT — must never be logged";
    execFileMock.mockImplementation((_cmd, args, _opts, cb) => {
      if (Array.isArray(args) && args[0] === "/tmp/does-not-matter.pdf") return;
      if ((execFileMock.mock.calls.length as number) === 1) {
        cb(null, "Pages: 1\n");
      } else {
        cb(null, secretPageText);
      }
    });

    const promise = measureLessonOneParity({
      odtPath: "/job/assembled.odt",
      outDir: fs.mkdtempSync(path.join(os.tmpdir(), "measureLessonOneParity-diag-")),
      profileDir: "/job/profile",
      series: 2,
      firstLessonNumber: 14,
    });
    queueMicrotask(() => renderChild.emit("close", 0));

    await promise.catch(() => undefined);

    for (const spy of [logSpy, warnSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(call.join(" ")).not.toContain(secretPageText);
      }
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("no absolute filesystem path appears in a thrown curated reason", async () => {
    const renderChild = new FakeChildProcess(556);
    spawnMock.mockImplementationOnce(() => renderChild);

    const promise = measureLessonOneParity({
      odtPath: "/docs/assembly-work/job-xyz/assembled.odt",
      outDir: fs.mkdtempSync(path.join(os.tmpdir(), "measureLessonOneParity-diag2-")),
      profileDir: "/docs/assembly-work/job-xyz/profile",
      series: 2,
      firstLessonNumber: 14,
    });
    queueMicrotask(() => renderChild.emit("close", 1));

    await expect(promise).rejects.toThrow(MeasureLessonOneParityError);
    try {
      await promise;
    } catch (err) {
      expect((err as Error).message).not.toMatch(/\/(Users|docs|tmp|home)\//);
    }
  });
});

// ---------------------------------------------------------------------------
// 10. Invocation discipline
// ---------------------------------------------------------------------------

describe("invocation discipline (contract §3, follows sofficeAssemble.ts not webifyLesson.ts)", () => {
  test("soffice is spawned with array arguments (spawn), never a shell string", async () => {
    const renderChild = new FakeChildProcess(600);
    spawnMock.mockImplementationOnce(() => renderChild);
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb(null, "Pages: 1\n"));

    const promise = measureLessonOneParity({
      odtPath: "/job/assembled.odt",
      outDir: fs.mkdtempSync(path.join(os.tmpdir(), "measureLessonOneParity-invoke-")),
      profileDir: "/job/profile",
      series: 2,
      firstLessonNumber: 14,
    });
    queueMicrotask(() => renderChild.emit("close", 0));
    await promise.catch(() => undefined);

    expect(spawnMock).toHaveBeenCalled();
    const [, spawnArgs] = spawnMock.mock.calls[0] as [string, unknown];
    expect(Array.isArray(spawnArgs)).toBe(true);
  });

  test("the render is spawned detached, so a process-group kill (process.kill(-pid, 'SIGKILL')) can target the whole group", async () => {
    const renderChild = new FakeChildProcess(601);
    spawnMock.mockImplementationOnce(() => renderChild);
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb(null, "Pages: 1\n"));

    const promise = measureLessonOneParity({
      odtPath: "/job/assembled.odt",
      outDir: fs.mkdtempSync(path.join(os.tmpdir(), "measureLessonOneParity-detach-")),
      profileDir: "/job/profile",
      series: 2,
      firstLessonNumber: 14,
    });
    queueMicrotask(() => renderChild.emit("close", 0));
    await promise.catch(() => undefined);

    const spawnOpts = spawnMock.mock.calls[0][2] as { detached?: boolean } | undefined;
    expect(spawnOpts?.detached).toBe(true);
  });

  test("an already-aborted signal rejects before anything is spawned", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      measureLessonOneParity({
        odtPath: "/job/assembled.odt",
        outDir: fs.mkdtempSync(path.join(os.tmpdir(), "measureLessonOneParity-abort-")),
        profileDir: "/job/profile",
        series: 2,
        firstLessonNumber: 14,
        signal: controller.signal,
      })
    ).rejects.toThrow();

    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("pollProcessGroupExited (contract §4, capped poll, never an open await)", () => {
  test("resolves true as soon as checkExited() reports the group is gone", async () => {
    let calls = 0;
    const checkExited = () => {
      calls += 1;
      return calls >= 2;
    };
    const result = await pollProcessGroupExited(checkExited, 5_000, 1);
    expect(result).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  test("resolves false once capMs elapses without the group exiting — never an open/unbounded wait", async () => {
    const alwaysAlive = () => false;
    const start = Date.now();
    const result = await pollProcessGroupExited(alwaysAlive, 50, 10);
    const elapsed = Date.now() - start;
    expect(result).toBe(false);
    // Bounded: this must return promptly after the cap, not hang.
    expect(elapsed).toBeLessThan(2_000);
  });
});

describe("renderKillLogLine (contract §4 partial-coverage fix, OOM-vs-timeout log distinction)", () => {
  test("a self-triggered kill (our own timeout/abort) reads distinctly from an externally-caused signal death", () => {
    const ourKill = renderKillLogLine(true);
    const externalKill = renderKillLogLine(false);
    expect(ourKill).not.toBe(externalKill);
    expect(ourKill.toLowerCase()).toMatch(/us|our|self/);
    expect(externalKill.toLowerCase()).not.toMatch(/\bus\b|\bour\b|\bself\b/);
  });
});

/**
 * `isRectoFillerEnabled` — the ASSEMBLY_RECTO_FILLER kill-switch predicate
 * (US3-T7 RED, contract §4 "Switch shape"). NOT YET EXPORTED: this module
 * has no such member today, so every assertion below reads it off the
 * imported module namespace as an unknown property rather than importing
 * the named binding directly — a direct `import { isRectoFillerEnabled }`
 * would fail TypeScript compilation ("has no exported member"), which is
 * the wrong kind of RED failure (a compile error, not an assertion
 * failure). Reading it dynamically keeps this file typechecking while the
 * assertions themselves fail, exactly as the RED protocol requires.
 *
 * Per contract §4: default ON; only an explicit 'off'/'false'/'0' value
 * (case-insensitive) disables it; every other value — unset, empty, or
 * unrecognized — keeps the guarantee; and it is evaluated PER CALL, never
 * module-load-cached, so both branches are testable without module-cache
 * manipulation.
 */
describe("isRectoFillerEnabled (US3-T7 RED, contract §4 kill-switch predicate)", () => {
  const ENV_VAR = "ASSEMBLY_RECTO_FILLER";
  const originalValue = process.env[ENV_VAR];

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_VAR];
    } else {
      process.env[ENV_VAR] = originalValue;
    }
  });

  /** Reads the predicate off the module namespace without a static import of the (not yet existing) name. */
  async function readPredicate(): Promise<(() => boolean) | undefined> {
    const mod: Record<string, unknown> = await import("./measureLessonOneParity");
    return mod["isRectoFillerEnabled"] as (() => boolean) | undefined;
  }

  test("is exported as a function, colocated with measureLessonOneParity", async () => {
    const predicate = await readPredicate();
    expect(typeof predicate).toBe("function");
  });

  test("defaults to true when the env var is unset", async () => {
    delete process.env[ENV_VAR];
    const predicate = await readPredicate();
    expect(predicate?.()).toBe(true);
  });

  test("defaults to true when the env var is set to an empty string", async () => {
    process.env[ENV_VAR] = "";
    const predicate = await readPredicate();
    expect(predicate?.()).toBe(true);
  });

  test.each(["off", "OFF", "false", "FALSE", "0"])(
    "returns false for the explicit disabling value %s",
    async (value) => {
      process.env[ENV_VAR] = value;
      const predicate = await readPredicate();
      expect(predicate?.()).toBe(false);
    }
  );

  test.each(["on", "true", "1", "yes", "nope", "  off  ", "off-by-typo"])(
    "keeps the guarantee (returns true) for the unrecognized value %s — a typo must not silently ship without it",
    async (value) => {
      process.env[ENV_VAR] = value;
      const predicate = await readPredicate();
      expect(predicate?.()).toBe(true);
    }
  );

  test("is evaluated PER CALL, not module-load-cached — flipping the env var between two calls changes the result", async () => {
    delete process.env[ENV_VAR];
    const predicate = await readPredicate();
    expect(predicate?.()).toBe(true);

    process.env[ENV_VAR] = "off";
    expect(predicate?.()).toBe(false);

    delete process.env[ENV_VAR];
    expect(predicate?.()).toBe(true);
  });
});
