/// <reference types="jest" />

jest.mock("./makeLessonFile");
jest.mock("./flattenFooterFields");
jest.mock("./renameMasterPageStyles");
jest.mock("../assembly/sofficeAssemble");

import fs from "fs";
import os from "os";
import path from "path";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { Lesson, TOC_LESSON } from "../../core/models/Lesson";
import makeLessonFile from "./makeLessonFile";
import { flattenFooterFields } from "./flattenFooterFields";
import { renameMasterPageStyles } from "./renameMasterPageStyles";
import { sofficeAssemble } from "../assembly/sofficeAssemble";
import assembleQuarter from "./assembleQuarter";

const makeLessonFileMock = makeLessonFile as unknown as jest.Mock;
const flattenFooterFieldsMock = flattenFooterFields as unknown as jest.Mock;
const renameMasterPageStylesMock = renameMasterPageStyles as unknown as jest.Mock;
const sofficeAssembleMock = sofficeAssemble as unknown as jest.Mock;

const SERIES = 1;

function lesson(lessonNumber: number): Lesson {
  return {
    lessonId: lessonNumber,
    book: "Luke",
    series: SERIES,
    lesson: lessonNumber,
    version: 1,
    lessonStrings: [],
  };
}

/** TOC + 13 lessons, deliberately out of order — assembleQuarter resolves order itself. */
function unorderedQuarterLessons(): Lesson[] {
  const numbers = Array.from({ length: 13 }, (_, i) => i + 1);
  const shuffled = [
    numbers[6],
    numbers[0],
    numbers[12],
    ...numbers.slice(1, 6),
    ...numbers.slice(7, 12),
  ];
  return [lesson(TOC_LESSON), ...shuffled.map(lesson)];
}

const motherLang: Language = {
  languageId: ENGLISH_ID,
  name: "English",
  code: "en",
  motherTongue: true,
  progress: [],
  defaultSrcLang: 0,
};

const storage = {} as Persistence;

describe("assembleQuarter", () => {
  let fixtureDir: string;
  /** Absolute paths returned by the mocked makeLessonFile, keyed by lesson number (TOC = 99). */
  let rawPathsByLessonNumber: Map<number, string>;

  beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-test-"));
    rawPathsByLessonNumber = new Map();

    makeLessonFileMock.mockReset();
    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      rawPathsByLessonNumber.set(lsn.lesson, rawPath);
      return rawPath;
    });

    flattenFooterFieldsMock.mockReset();
    flattenFooterFieldsMock.mockImplementation(() => undefined);

    renameMasterPageStylesMock.mockReset();
    renameMasterPageStylesMock.mockImplementation(() => undefined);

    sofficeAssembleMock.mockReset();
    sofficeAssembleMock.mockImplementation(
      async (options: { outputPath: string; files: string[] }) => {
        fs.writeFileSync(options.outputPath, "assembled contents");
        return { outputPath: options.outputPath };
      }
    );
  });

  afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  test("orders constituents TOC first, then lessons ascending by absolute number", async () => {
    await assembleQuarter({
      storage,
      lessons: unorderedQuarterLessons(),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-1",
      workRoot: fixtureDir,
    });

    expect(sofficeAssembleMock).toHaveBeenCalledTimes(1);
    const { files } = sofficeAssembleMock.mock.calls[0][0] as { files: string[] };
    const basenames = files.map((f) => path.basename(f));
    expect(basenames).toEqual([
      "00.odt",
      "01.odt",
      "02.odt",
      "03.odt",
      "04.odt",
      "05.odt",
      "06.odt",
      "07.odt",
      "08.odt",
      "09.odt",
      "10.odt",
      "11.odt",
      "12.odt",
      "13.odt",
    ]);
  });

  test("names copies with ASCII deterministic insertion-order filenames under the per-job dir", async () => {
    await assembleQuarter({
      storage,
      lessons: unorderedQuarterLessons(),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-2",
      workRoot: fixtureDir,
    });

    const { files } = sofficeAssembleMock.mock.calls[0][0] as { files: string[] };
    files.forEach((f) => {
      expect(f.startsWith(path.join(fixtureDir, "job-2"))).toBe(true);
      // ASCII-only: every char code must be in the printable-ASCII range.
      expect([...f].every((ch) => ch.charCodeAt(0) <= 127)).toBe(true);
    });
  });

  test("generates each constituent exactly once (no double-generation)", async () => {
    await assembleQuarter({
      storage,
      lessons: unorderedQuarterLessons(),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-3",
      workRoot: fixtureDir,
    });

    expect(makeLessonFileMock).toHaveBeenCalledTimes(14);
  });

  test("copies each constituent into the per-job dir before flatten is invoked, never mutating the raw makeLessonFile path", async () => {
    await assembleQuarter({
      storage,
      lessons: unorderedQuarterLessons(),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-4",
      workRoot: fixtureDir,
    });

    expect(flattenFooterFieldsMock).toHaveBeenCalledTimes(14);
    const rawPaths = new Set(rawPathsByLessonNumber.values());

    flattenFooterFieldsMock.mock.calls.forEach(([options]) => {
      const { odtPath } = options as { odtPath: string };
      expect(rawPaths.has(odtPath)).toBe(false);
      expect(odtPath.startsWith(path.join(fixtureDir, "job-4"))).toBe(true);
    });
  });

  test("renames each constituent's master-page styles (per-constituent-unique suffix) before flattening its footer", async () => {
    await assembleQuarter({
      storage,
      lessons: unorderedQuarterLessons(),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-6",
      workRoot: fixtureDir,
    });

    expect(renameMasterPageStylesMock).toHaveBeenCalledTimes(14);
    const rawPaths = new Set(rawPathsByLessonNumber.values());
    const seenSuffixes = new Set<string>();

    renameMasterPageStylesMock.mock.calls.forEach(([options]) => {
      const { odtPath, suffix } = options as { odtPath: string; suffix: string };
      expect(rawPaths.has(odtPath)).toBe(false);
      expect(odtPath.startsWith(path.join(fixtureDir, "job-6"))).toBe(true);
      expect(seenSuffixes.has(suffix)).toBe(false);
      seenSuffixes.add(suffix);
    });
    expect(seenSuffixes.size).toBe(14);

    // Renamed before the footer is flattened, on the same copy path each time.
    expect(renameMasterPageStylesMock.mock.invocationCallOrder[0]).toBeLessThan(
      flattenFooterFieldsMock.mock.invocationCallOrder[0]
    );
  });

  test("never passes a raw makeLessonFile path to the soffice merge", async () => {
    await assembleQuarter({
      storage,
      lessons: unorderedQuarterLessons(),
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-5",
      workRoot: fixtureDir,
    });

    const { files } = sofficeAssembleMock.mock.calls[0][0] as { files: string[] };
    const rawPaths = new Set(rawPathsByLessonNumber.values());
    files.forEach((f) => expect(rawPaths.has(f)).toBe(false));
  });

  test("US16 defense-in-depth: drops a synthetic non-TOC lesson-97 outside expectedLessonNumbers(series) even if passed in", async () => {
    await assembleQuarter({
      storage,
      lessons: [...unorderedQuarterLessons(), lesson(97)],
      motherLang,
      majorityLangId: ENGLISH_ID,
      jobId: "job-7",
      workRoot: fixtureDir,
    });

    // Only the TOC + the 13 expected lesson numbers were generated/merged —
    // the synthetic lesson-97 constituent never reaches makeLessonFile or
    // the soffice merge.
    expect(makeLessonFileMock).toHaveBeenCalledTimes(14);
    expect(
      makeLessonFileMock.mock.calls.some(([, lsn]: [Persistence, Lesson]) => lsn.lesson === 97)
    ).toBe(false);

    const { files } = sofficeAssembleMock.mock.calls[0][0] as { files: string[] };
    expect(files).toHaveLength(14);
  });
});

/**
 * US4 (lessons-from-luke-koog.6.5.2/.3): completeness gate + curated
 * failure-reason vocabulary. Spec: specs/007-assembled-quarter-download/
 * data-model.md "Quarter completeness (FR-006 / US4)",
 * specs/acceptance-specs/US12-blocked-incomplete-quarter.txt scenario 2
 * ("A mid-assembly generation failure ends in a retryable failed state").
 *
 * The generation-time half of the completeness gate (each of the 14
 * constituents generates via `makeLessonFile` without error) is NOT a
 * synchronous pre-check — it runs as part of the per-constituent loop
 * `assembleQuarter` already has. RED: today a `makeLessonFile` failure
 * propagates as the raw thrown error (whatever message `makeLessonFile`
 * happens to throw), which `AssemblyJobRegistry` uses verbatim as the
 * `failed` job's `reason` (`error.message`, `AssemblyJobRegistry.ts`
 * `promoteNext`'s `.catch`). That raw message can carry a stack trace or an
 * absolute filesystem path — exactly what the curated-vocabulary rule
 * (data-model.md "reason hygiene") forbids reaching a human. `assembleQuarter`
 * MUST catch a per-constituent generation failure and re-throw a curated,
 * fixed-vocabulary `Error` naming the failing lesson instead.
 */
describe("assembleQuarter — US4 generation-failure curated reason", () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "assembleQuarter-us4-test-"));

    makeLessonFileMock.mockReset();
    flattenFooterFieldsMock.mockReset();
    flattenFooterFieldsMock.mockImplementation(() => undefined);
    renameMasterPageStylesMock.mockReset();
    renameMasterPageStylesMock.mockImplementation(() => undefined);
    sofficeAssembleMock.mockReset();
    sofficeAssembleMock.mockImplementation(
      async (options: { outputPath: string; files: string[] }) => {
        fs.writeFileSync(options.outputPath, "assembled contents");
        return { outputPath: options.outputPath };
      }
    );
  });

  afterEach(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  test("a constituent that throws during generation rejects with a curated reason naming that lesson (Luke 1-3), not the raw error", async () => {
    // Raw failure detail deliberately includes an absolute path and an
    // "Error:"-prefixed stack, exactly the kind of internal detail the
    // curated reason MUST NOT leak.
    const rawDetail =
      "Error: soffice conversion failed\n" +
      "    at /Users/eykd/code/js/lessons-from-luke/src/server/actions/makeLessonFile.ts:34:11";

    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      if (lsn.lesson === 3) {
        throw new Error(rawDetail);
      }
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });

    await expect(
      assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-1",
        workRoot: fixtureDir,
      })
    ).rejects.toThrow(/Luke 1-3/);

    // The soffice merge must never run once a constituent has failed to
    // generate — no partial file offered (US12 scenario 2).
    expect(sofficeAssembleMock).not.toHaveBeenCalled();
  });

  test("the rejected reason never leaks a stack trace or a filesystem path", async () => {
    const rawDetail =
      "Error: ENOENT: no such file or directory, open " +
      "'/Users/eykd/code/js/lessons-from-luke/docs/dev/Luke-1-05v01.odt'";

    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      if (lsn.lesson === 5) {
        throw new Error(rawDetail);
      }
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-2",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    // No absolute-path separators, no raw "Error:"/ENOENT leakage, and the
    // curated message must not simply be the raw thrown message forwarded.
    expect(message).not.toMatch(/\//);
    expect(message).not.toMatch(/Error:/);
    expect(message).not.toMatch(/ENOENT/);
    expect(message).not.toBe(rawDetail);
  });

  test("a renameMasterPageStyles failure (e.g. a raw execFileSync/zip error) yields a curated, path-free reason", async () => {
    const rawDetail =
      "Command failed: zip -d " +
      "/Users/eykd/code/js/lessons-from-luke/tmp/job-us4-3/00.odt styles.xml\n" +
      "zip warning: name not matched";

    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });
    renameMasterPageStylesMock.mockImplementation(() => {
      throw new Error(rawDetail);
    });

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-3",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/\//);
    expect(message).not.toMatch(/Command failed/);
    expect(message).not.toBe(rawDetail);
    expect(sofficeAssembleMock).not.toHaveBeenCalled();
  });

  test("a flattenFooterFields failure (e.g. a raw libxmljs2 parse error) yields a curated, path-free reason", async () => {
    const rawDetail =
      "libxmljs2: parse error at " +
      "/Users/eykd/code/js/lessons-from-luke/tmp/job-us4-4/03.odt:12:4";

    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });
    flattenFooterFieldsMock.mockImplementation(() => {
      throw new Error(rawDetail);
    });

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-4",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/\//);
    expect(message).not.toMatch(/libxmljs2/);
    expect(message).not.toBe(rawDetail);
    expect(sofficeAssembleMock).not.toHaveBeenCalled();
  });

  test("a missing (never-written) sofficeAssemble outputPath is treated as a failure, not a ready result", async () => {
    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });
    sofficeAssembleMock.mockImplementation(async (options: { outputPath: string }) =>
      // Resolves successfully (soffice exited 0) but never actually wrote
      // outputPath — e.g. the macro silently no-oped.
      ({ outputPath: options.outputPath })
    );

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-5",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/\//);
  });

  test("a mkdirSafe (job working-dir setup) failure yields a curated, path-free reason", async () => {
    const rawDetail =
      "EACCES: permission denied, mkdir " +
      "'/Users/eykd/code/js/lessons-from-luke/tmp/assembly-work/job-us4-7'";

    const mkdirSpy = jest.spyOn(fs, "mkdirSync").mockImplementationOnce(() => {
      throw new Error(rawDetail);
    });

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-7",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }
    mkdirSpy.mockRestore();

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/\//);
    expect(message).not.toMatch(/EACCES/);
    expect(message).not.toBe(rawDetail);
    expect(makeLessonFileMock).not.toHaveBeenCalled();
  });

  test("a copyFileSync (raw constituent copy) failure yields a curated, path-free reason naming the lesson", async () => {
    const rawDetail =
      "ENOSPC: no space left on device, copyfile " +
      "'/Users/eykd/code/js/lessons-from-luke/docs/Luke-1-01v01.odt' -> " +
      "'/tmp/assembly-work/job-us4-8/00.odt'";

    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });
    const copySpy = jest.spyOn(fs, "copyFileSync").mockImplementationOnce(() => {
      throw new Error(rawDetail);
    });

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-8",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }
    copySpy.mockRestore();

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/\//);
    expect(message).not.toMatch(/ENOSPC/);
    expect(message).not.toBe(rawDetail);
    expect(sofficeAssembleMock).not.toHaveBeenCalled();
  });

  test("an empty (zero-byte) sofficeAssemble result is treated as a failure with a path-free reason", async () => {
    makeLessonFileMock.mockImplementation(async (_storage: Persistence, lsn: Lesson) => {
      const rawPath = path.join(fixtureDir, `raw-${lsn.lesson}.odt`);
      fs.writeFileSync(rawPath, `raw contents for lesson ${lsn.lesson}`);
      return rawPath;
    });
    sofficeAssembleMock.mockImplementation(async (options: { outputPath: string }) => {
      fs.writeFileSync(options.outputPath, "");
      return { outputPath: options.outputPath };
    });

    let caught: unknown;
    try {
      await assembleQuarter({
        storage,
        lessons: unorderedQuarterLessons(),
        motherLang,
        majorityLangId: ENGLISH_ID,
        jobId: "job-us4-6",
        workRoot: fixtureDir,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).not.toMatch(/\//);
  });
});
