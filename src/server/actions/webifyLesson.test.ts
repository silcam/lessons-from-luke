/// <reference types="jest" />

jest.mock('../xml/mergeXml', () => jest.fn());
jest.mock('child_process', () => ({ exec: jest.fn() }));

import { PGTestStorage } from "../storage/PGStorage";
import webifyLesson from "./webifyLesson";
import docStorage from "../storage/docStorage";
import { unlinkSafe } from "../../core/util/fsUtils";
import fs from "fs";
import { exec } from "child_process";

// This test takes forever, only run as needed
// IMPORTANT - This test can fail if LibreOffice Writer is open. Try closing LibreOffice and running again.

test.skip("Webify Lesson", async () => {
  unlinkSafe(docStorage.webifyPath() + "/13.htm");
  const storage = new PGTestStorage();
  const lesson = await storage.lesson(13);
  expect(lesson).toBeTruthy();
  if (lesson) {
    await webifyLesson(lesson, { force: true });
    expect(docStorage.webifiedHtml(lesson)).toBeTruthy();
  }

  unlinkSafe(docStorage.webifyPath() + "/13.htm");
  const filenames = fs.readdirSync(docStorage.webifyPath());
  filenames.forEach(filename => {
    if (/_1-03_htm/.test(filename))
      unlinkSafe(docStorage.webifyPath() + "/" + filename);
  });
}, 15000);

test("webifyLesson handles exec error gracefully", async () => {
  const storage = new PGTestStorage();
  const lesson = await storage.lesson(13);
  expect(lesson).toBeTruthy();

  (exec as unknown as jest.Mock).mockImplementation(
    (_cmd: string, cb: (err: Error | null) => void) => {
      cb(new Error("soffice failed"));
      return {} as any;
    }
  );
  const mvSpy = jest
    .spyOn(docStorage, "mvWebifiedHtml")
    .mockResolvedValue(undefined);
  const consoleSpy = jest.spyOn(console, "error").mockImplementation();

  await webifyLesson(lesson!, { force: true });

  expect(consoleSpy).toHaveBeenCalled();
  expect(mvSpy).not.toHaveBeenCalled();

  mvSpy.mockRestore();
  consoleSpy.mockRestore();
});

test("webifyLesson calls mvWebifiedHtml on exec success", async () => {
  const storage = new PGTestStorage();
  const lesson = await storage.lesson(13);
  expect(lesson).toBeTruthy();

  (exec as unknown as jest.Mock).mockImplementation(
    (_cmd: string, cb: (err: null) => void) => {
      cb(null);
      return {} as any;
    }
  );
  const mvSpy = jest
    .spyOn(docStorage, "mvWebifiedHtml")
    .mockResolvedValue(undefined);

  await webifyLesson(lesson!, { force: true });

  expect(mvSpy).toHaveBeenCalled();

  mvSpy.mockRestore();
});

test("mvWebifiedHtml catches and logs errors when file never appears", async () => {
  jest.useFakeTimers();
  const realExistsSync = fs.existsSync.bind(fs);
  const existsSpy = jest
    .spyOn(fs, "existsSync")
    .mockImplementation((p: fs.PathLike) => {
      // Return false only for the .htm file being waited on; use real impl for dirs
      if (typeof p === "string" && p.endsWith(".htm")) return false;
      return realExistsSync(p);
    });
  const consoleSpy = jest.spyOn(console, "error").mockImplementation();

  const fakeLesson = {
    lessonId: 99,
    version: 1,
    book: "Luke",
    series: 1,
    lesson: 1
  } as any;

  const promise = docStorage.mvWebifiedHtml("/tmp/fake_test.odt", fakeLesson);
  jest.advanceTimersByTime(11000);
  await promise;

  expect(consoleSpy).toHaveBeenCalled();

  existsSpy.mockRestore();
  consoleSpy.mockRestore();
  jest.useRealTimers();
});

test("mvWebifiedHtml renames converted HTML file on success", async () => {
  const existsSpy = jest
    .spyOn(fs, "existsSync")
    .mockReturnValue(true as any);
  const renameSpy = jest
    .spyOn(fs, "renameSync")
    .mockImplementation((() => {}) as any);

  const fakeLesson = {
    lessonId: 99,
    version: 1,
    book: "Luke",
    series: 1,
    lesson: 1
  } as any;

  await docStorage.mvWebifiedHtml("/tmp/fake_test_9999.odt", fakeLesson);

  expect(renameSpy).toHaveBeenCalledWith(
    expect.stringContaining("fake_test_9999.htm"),
    expect.stringContaining("99-1.htm")
  );

  existsSpy.mockRestore();
  renameSpy.mockRestore();
});

test("tmpFilePath deletes old files from tmp directory", () => {
  // Create a file with a timestamp from 25 hours ago
  const oldTimestamp = new Date().valueOf() - 1000 * 60 * 60 * 25;
  const tmpDir = `${process.cwd()}/test/docs/serverDocs/tmp`;
  const oldFilePath = `${tmpDir}/${oldTimestamp}`;
  fs.writeFileSync(oldFilePath, "old temp file");
  expect(fs.existsSync(oldFilePath)).toBe(true);

  // Calling tmpFilePath triggers cleanTmpDir which should delete old files
  docStorage.tmpFilePath("test-file.odt");

  expect(fs.existsSync(oldFilePath)).toBe(false);
});

test("docStorage.webifyPath creates directory if it does not exist", () => {
  // We need requireDir to see the path as non-existent and call mkdirSync
  // Use a path-specific mock for existsSync
  const mkdirSpy = jest
    .spyOn(fs, "mkdirSync")
    .mockImplementation((() => {}) as any);

  // Make existsSync return false to simulate a missing directory
  const existsSpy = jest.spyOn(fs, "existsSync").mockReturnValue(false as any);

  try {
    docStorage.webifyPath();
    // mkdirSync should have been called since directory "doesn't exist"
    expect(mkdirSpy).toHaveBeenCalled();
  } finally {
    existsSpy.mockRestore();
    mkdirSpy.mockRestore();
  }
});
