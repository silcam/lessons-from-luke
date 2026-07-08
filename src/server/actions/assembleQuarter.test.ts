/// <reference types="jest" />

jest.mock("./makeLessonFile");
jest.mock("./flattenFooterFields");
jest.mock("../assembly/sofficeAssemble");

import fs from "fs";
import os from "os";
import path from "path";
import { Persistence } from "../../core/interfaces/Persistence";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { Lesson, TOC_LESSON } from "../../core/models/Lesson";
import makeLessonFile from "./makeLessonFile";
import { flattenFooterFields } from "./flattenFooterFields";
import { sofficeAssemble } from "../assembly/sofficeAssemble";
import assembleQuarter from "./assembleQuarter";

const makeLessonFileMock = makeLessonFile as unknown as jest.Mock;
const flattenFooterFieldsMock = flattenFooterFields as unknown as jest.Mock;
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

    sofficeAssembleMock.mockReset();
    sofficeAssembleMock.mockImplementation(
      async (options: { outputPath: string; files: string[] }) => ({
        outputPath: options.outputPath,
      })
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
});
