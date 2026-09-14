import {
  unzip,
  unlinkRecursive,
  unlinkSafe,
  mkdirSafe,
  touch,
  assetsPath,
  tmpDirPath,
  copyRecursive,
  moveFileSync,
  setupDesktopStorage,
} from "./fsUtils";
import fs from "fs";
import os from "os";
import path from "path";

// Read the pristine, git-tracked fixture; extract into an OS temp dir so nothing
// is ever written inside a tracked path.
const zipPath = "test/docs/serverDocs/Luke-1-01v03.odt";
const dirPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "fsUtils-test-")),
  "Luke-1-01v03.odt_FILES"
);

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

test("moveFileSync moves a file within one filesystem", () => {
  const src = "test/tmp-moveFileSync-src.txt";
  const dst = "test/tmp-moveFileSync-dst.txt";
  fs.writeFileSync(src, "contents");

  moveFileSync(src, dst);

  expect(fs.existsSync(dst)).toBe(true);
  expect(fs.readFileSync(dst, "utf8")).toBe("contents");
  expect(fs.existsSync(src)).toBe(false);
  unlinkSafe(dst);
});

test("moveFileSync falls back to a copy when the rename crosses filesystems (EXDEV)", () => {
  // The failure this helper exists for: a cross-device rename throws EXDEV,
  // and whether two paths share a device is environment-dependent — macOS
  // dev machines say yes where CI containers say no, so it can only be
  // reproduced by forcing the error.
  const src = "test/tmp-moveFileSync-exdev-src.txt";
  const dst = "test/tmp-moveFileSync-exdev-dst.txt";
  fs.writeFileSync(src, "contents");
  const renameSpy = jest.spyOn(fs, "renameSync").mockImplementationOnce(() => {
    throw Object.assign(new Error("EXDEV: cross-device link not permitted, rename"), {
      code: "EXDEV",
    });
  });

  moveFileSync(src, dst);
  renameSpy.mockRestore();

  expect(fs.readFileSync(dst, "utf8")).toBe("contents");
  unlinkSafe(src);
  unlinkSafe(dst);
});

test("moveFileSync rethrows a non-EXDEV failure rather than silently copying", () => {
  const renameSpy = jest.spyOn(fs, "renameSync").mockImplementationOnce(() => {
    throw Object.assign(new Error("EACCES: permission denied, rename"), { code: "EACCES" });
  });
  const copySpy = jest.spyOn(fs, "copyFileSync");

  expect(() => moveFileSync("test/tmp-a.txt", "test/tmp-b.txt")).toThrow(/EACCES/);
  expect(copySpy).not.toHaveBeenCalled();

  renameSpy.mockRestore();
  copySpy.mockRestore();
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
