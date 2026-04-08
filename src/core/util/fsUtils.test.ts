import {
  unzip,
  unlinkRecursive,
  unlinkSafe,
  mkdirSafe,
  touch,
  assetsPath,
  tmpDirPath,
  copyRecursive,
  setupDesktopStorage
} from "./fsUtils";
import fs from "fs";
import path from "path";

const zipPath = "test/docs/serverDocs/Luke-1-01v03.odt";
const dirPath = "test/docs/serverDocs/Luke-1-01v03.odt_FILES";

const tmpTestDir = "test/tmp-fsutils-test";

afterAll(() => {
  unlinkRecursive(dirPath);
  unlinkRecursive(tmpTestDir);
});
test("assetsPath returns an absolute path containing the dirName", () => {
  const result = assetsPath("somedir");
  expect(path.isAbsolute(result)).toBe(true);
  expect(result).toContain("somedir");
});

test("tmpDirPath returns an absolute path ending with /tmp", () => {
  const result = tmpDirPath();
  expect(path.isAbsolute(result)).toBe(true);
  expect(result.endsWith("tmp")).toBe(true);
});

test("unlinkSafe does nothing when file does not exist", () => {
  expect(() => unlinkSafe("/nonexistent/path/file.txt")).not.toThrow();
});

test("unlinkSafe removes file when it exists", () => {
  const tmpFile = "test/tmp-fsutils-unlinkSafe.txt";
  touch(tmpFile);
  expect(fs.existsSync(tmpFile)).toBe(true);
  unlinkSafe(tmpFile);
  expect(fs.existsSync(tmpFile)).toBe(false);
});

test("mkdirSafe creates directory when it does not exist", () => {
  mkdirSafe(tmpTestDir);
  expect(fs.existsSync(tmpTestDir)).toBe(true);
});

test("mkdirSafe does not throw when directory already exists", () => {
  mkdirSafe(tmpTestDir);
  expect(() => mkdirSafe(tmpTestDir)).not.toThrow();
});

test("Unzip overwrites", () => {
  unzip(zipPath, dirPath);
  expect(() => {
    // This will fail if the overwrite flag is not set
    unzip(zipPath, dirPath);
  }).not.toThrow();
});

test("copyRecursive copies a file to a new location", () => {
  const src = "test/tmp-copyRecursive-src.txt";
  const dst = "test/tmp-copyRecursive-dst.txt";
  touch(src);
  copyRecursive(src, dst);
  expect(fs.existsSync(dst)).toBe(true);
  unlinkSafe(src);
  unlinkSafe(dst);
});

test("copyRecursive copies a directory and its contents", () => {
  const srcDir = "test/tmp-copyRecursive-srcdir";
  const dstDir = "test/tmp-copyRecursive-dstdir";
  mkdirSafe(srcDir);
  touch(path.join(srcDir, "file.txt"));
  copyRecursive(srcDir, dstDir);
  expect(fs.existsSync(path.join(dstDir, "file.txt"))).toBe(true);
  unlinkRecursive(srcDir);
  unlinkRecursive(dstDir);
});

test("unlinkRecursive removes a directory and its contents", () => {
  const dir = "test/tmp-unlinkRecursive-dir";
  mkdirSafe(dir);
  touch(path.join(dir, "file.txt"));
  unlinkRecursive(dir);
  expect(fs.existsSync(dir)).toBe(false);
});

test("unlinkRecursive does nothing when path does not exist", () => {
  expect(() => unlinkRecursive("/nonexistent/path/fsutils-test-xyz")).not.toThrow();
});

test("copyRecursive throws and re-throws for non-existent source", () => {
  expect(() =>
    copyRecursive("/nonexistent/does/not/exist/abc123", "/tmp/dest-that-wont-be-created")
  ).toThrow();
});

test("setupDesktopStorage creates strings and translations directories", () => {
  setupDesktopStorage();
  expect(fs.existsSync("strings")).toBe(true);
  expect(fs.existsSync(path.join("strings", "translations"))).toBe(true);
  // cleanup
  unlinkRecursive("strings");
});
