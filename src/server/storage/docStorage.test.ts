/// <reference types="jest" />

import os from "os";
import path from "path";
import process from "process";

// Mock fs before importing docStorage so the mock is in place
jest.mock("fs");
jest.mock("../../core/util/fsUtils");
// The real seed module does live fs work; docStorage only calls it lazily, but
// keep the seeding inert here so the mocked fs is never handed to it. The path
// helper stays real (docsDirPath depends on it).
jest.mock("./seedServerDocs", () => ({
  serverDocsRunDir: () => `${process.cwd()}/test/docs/serverDocs-run`,
  ensureServerDocsRunDir: jest.fn(),
}));

import fs from "fs";
import {
  mkdirSafe,
  moveFileSync,
  unzip,
  unlinkRecursive,
  unlinkSafe,
} from "../../core/util/fsUtils";
import docStorage from "./docStorage";
import { BaseLesson } from "../../core/models/Lesson";

const mockFs = fs as jest.Mocked<typeof fs>;
const mockMkdirSafe = mkdirSafe as jest.MockedFunction<typeof mkdirSafe>;
const mockUnzip = unzip as jest.MockedFunction<typeof unzip>;
const mockUnlinkRecursive = unlinkRecursive as jest.MockedFunction<typeof unlinkRecursive>;
const mockUnlinkSafe = unlinkSafe as jest.MockedFunction<typeof unlinkSafe>;
const mockMoveFileSync = moveFileSync as jest.MockedFunction<typeof moveFileSync>;

function docsDirPath() {
  // Under NODE_ENV=test docStorage redirects to the disposable run dir so no
  // test writes into the git-tracked fixture corpus. See seedServerDocs.ts.
  return `${process.cwd()}/test/docs/serverDocs-run`;
}

describe("docStorage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // requireDir calls fs.existsSync and fs.mkdirSync - default to dir exists
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
  });

  describe("docFilepath", () => {
    it("returns the correct path for a lesson in test mode", () => {
      const lesson: BaseLesson = {
        lessonId: 11,
        book: "Luke",
        series: 1,
        lesson: 1,
        version: 3,
      };
      const filepath = docStorage.docFilepath(lesson);
      const expected = `${docsDirPath()}/Luke-1-01v03.odt`;
      expect(filepath).toBe(expected);
    });

    it("zero-pads lesson and version numbers", () => {
      const lesson: BaseLesson = {
        lessonId: 15,
        book: "Acts",
        series: 2,
        lesson: 9,
        version: 5,
      };
      const filepath = docStorage.docFilepath(lesson);
      expect(filepath).toBe(`${docsDirPath()}/Acts-2-09v05.odt`);
    });
  });

  describe("webifiedHtml", () => {
    const lesson: BaseLesson = { lessonId: 11, book: "Luke", series: 1, lesson: 1, version: 3 };

    it("returns null when the htm file does not exist", () => {
      (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p.endsWith(".htm")) return false;
        return true; // directories exist
      });
      const result = docStorage.webifiedHtml(lesson);
      expect(result).toBeNull();
    });

    it("returns HTML content when the file exists", () => {
      const rawHtml = '<html><body><img src="foo.png"></body></html>';
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(rawHtml));
      const result = docStorage.webifiedHtml(lesson);
      expect(result).toBe('<html><body><img src="/webified/foo.png"></body></html>');
    });

    it("replaces all img src occurrences in the HTML", () => {
      const rawHtml = '<img src="a.png"><img src="b.png">';
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(rawHtml));
      const result = docStorage.webifiedHtml(lesson);
      expect(result).toBe('<img src="/webified/a.png"><img src="/webified/b.png">');
    });
  });

  describe("tmpFilePath", () => {
    it("reads the tmp dir (cleanTmpDir) and returns a timestamped path", () => {
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);
      const before = Date.now();
      const filepath = docStorage.tmpFilePath("myfile.odt");
      const after = Date.now();

      // readdirSync should have been called with the tmp dir to clean it
      expect(mockFs.readdirSync).toHaveBeenCalledWith(`${docsDirPath()}/tmp`);

      // The path should end with _myfile.odt
      expect(filepath).toMatch(/_myfile\.odt$/);
      expect(filepath).toContain(`${docsDirPath()}/tmp/`);

      // The timestamp portion should be between before and after
      const timestampStr = path.basename(filepath).split("_")[0];
      const timestamp = parseInt(timestampStr, 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("unlinks tmp files older than 24 hours", () => {
      const old = (Date.now() - 1000 * 60 * 60 * 25).toString(); // 25 hours ago
      const recent = Date.now().toString();
      (mockFs.readdirSync as jest.Mock).mockReturnValue([old, recent]);
      mockUnlinkSafe.mockReturnValue(undefined);

      docStorage.tmpFilePath("test.odt");

      expect(mockUnlinkSafe).toHaveBeenCalledWith(`${docsDirPath()}/tmp/${old}`);
      expect(mockUnlinkSafe).not.toHaveBeenCalledWith(`${docsDirPath()}/tmp/${recent}`);
    });

    // Defense-in-depth (lessons-from-luke-fm4a.7): even if a caller passes an
    // unsanitized baseName containing traversal segments, the resolved path
    // must stay inside docsTmpPath().
    it("resolves inside docsTmpPath() even when baseName contains traversal segments", () => {
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);
      const filepath = docStorage.tmpFilePath("../../../evil.odt");
      const tmpDir = `${docsDirPath()}/tmp`;
      expect(path.resolve(filepath).startsWith(path.resolve(tmpDir) + path.sep)).toBe(true);
    });
  });

  describe("docXml", () => {
    it("calls mkdirSafe, unzip, reads xml files, and calls unlinkRecursive", () => {
      const docPath = "/some/path/lesson.odt";
      const xmlContent = "<root/>";
      (mockFs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(xmlContent));
      mockMkdirSafe.mockReturnValue("/some/extract/dir");
      mockUnzip.mockReturnValue(undefined as any);
      mockUnlinkRecursive.mockReturnValue(undefined);

      const result = docStorage.docXml(docPath);

      // mkdirSafe should have been called to create the extract dir, which
      // lives under the OS temp dir (outside the watched project tree) and is
      // named from the source ODT's basename.
      expect(mockMkdirSafe).toHaveBeenCalledTimes(1);
      const extractDir = mockMkdirSafe.mock.calls[0][0];
      expect(extractDir.startsWith(os.tmpdir())).toBe(true);
      expect(extractDir).toContain(path.basename(docPath));
      expect(extractDir).toContain("_FILES");

      // unzip should be called
      expect(mockUnzip).toHaveBeenCalledWith(docPath, extractDir);

      // readFileSync called for content.xml, meta.xml, styles.xml
      expect(mockFs.readFileSync).toHaveBeenCalledTimes(3);
      const readPaths = (mockFs.readFileSync as jest.Mock).mock.calls.map((c: any[]) => c[0]);
      expect(readPaths).toContainEqual(path.join(extractDir, "content.xml"));
      expect(readPaths).toContainEqual(path.join(extractDir, "meta.xml"));
      expect(readPaths).toContainEqual(path.join(extractDir, "styles.xml"));

      // unlinkRecursive called to clean up extract dir
      expect(mockUnlinkRecursive).toHaveBeenCalledWith(extractDir);

      // result has the three xml types
      expect(result).toEqual({ content: xmlContent, meta: xmlContent, styles: xmlContent });
    });
  });

  describe("webifyPath", () => {
    it("returns the web subdirectory of the docs dir", () => {
      const webPath = docStorage.webifyPath();
      expect(webPath).toBe(`${docsDirPath()}/web`);
    });
  });

  describe("mvWebifiedHtml", () => {
    it("waits for the source htm and moves it to the lesson-version path", async () => {
      const lesson: BaseLesson = { lessonId: 11, book: "Luke", series: 1, lesson: 1, version: 3 };
      const tmpOdtPath = `${docsDirPath()}/web/12345.odt`;
      const inPath = `${docsDirPath()}/web/12345.htm`;
      const outPath = `${docsDirPath()}/web/${lesson.lessonId}-${lesson.version}.htm`;

      // existsSync returns true immediately so waitFor resolves on first check
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      mockMoveFileSync.mockReturnValue(undefined);

      await docStorage.mvWebifiedHtml(tmpOdtPath, lesson);

      // `moveFileSync`, not a bare `fs.renameSync`: a bare rename fails EXDEV
      // when `docs/` is its own mount (eslint.config.js forbids it).
      expect(mockMoveFileSync).toHaveBeenCalledWith(inPath, outPath);
    });
  });
});
