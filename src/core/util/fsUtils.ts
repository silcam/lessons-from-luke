import fs from "fs";
import child_process from "child_process";
import path from "path";
import process from "process";

export function mkdirSafe(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
  return dirPath;
}

export function unlinkSafe(filepath: string) {
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
}

export function touch(filepath: string) {
  fs.writeFileSync(filepath, "");
}

/**
 * Move a file, falling back to a copy when the two paths are on different
 * filesystems.
 *
 * ALWAYS use this instead of a bare `fs.renameSync` (the `no-restricted-syntax`
 * rule in `eslint.config.js` enforces it). A cross-device rename fails EXDEV,
 * and that failure is environment-dependent in exactly the way that hides
 * during development and appears in CI or production: on macOS `/tmp`, `docs/`
 * and the workspace share a device, so `renameSync` succeeds; inside a CI
 * container — or on a host where `docs/` is its own mount — they do not.
 *
 * The source is left in place on the copy path. Callers that need it gone must
 * unlink it themselves (usually they are already deleting the whole source dir).
 */
export function moveFileSync(from: string, to: string) {
  try {
    fs.renameSync(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    fs.copyFileSync(from, to);
  }
}

export function unzip(inPath: string, outPath: string) {
  child_process.execSync(`unzip -o "${inPath}" -d "${outPath}"`);
}

export function zip(srcDir: string, outPath: string) {
  const tmpzip = ".tmpzip.zip";
  child_process.execSync(`cd "${srcDir}" && zip -r "${tmpzip}" ./*`);
  moveFileSync(`${srcDir}/${tmpzip}`, outPath);
  unlinkSafe(`${srcDir}/${tmpzip}`);
}

export function copyRecursive(from: string, to: string) {
  // console.log(`Copy to ${to}`);
  try {
    if (fs.statSync(from).isDirectory()) {
      mkdirSafe(to);
      fs.readdirSync(from).forEach((filename) => {
        copyRecursive(path.join(from, filename), path.join(to, filename));
      });
    } else {
      fs.copyFileSync(from, to);
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export function unlinkRecursive(filepath: string) {
  // console.log(`Unlink ${filepath}`);
  if (fs.existsSync(filepath)) {
    if (fs.statSync(filepath).isDirectory()) {
      fs.readdirSync(filepath).forEach((filename) => {
        unlinkRecursive(path.join(filepath, filename));
      });
      fs.rmdirSync(filepath);
    } else {
      fs.unlinkSync(filepath);
    }
  }
}

export function setupDesktopStorage() {
  mkdirSafe("strings");
  mkdirSafe(path.join("strings", "translations"));
}

export function assetsPath(dirName: string) {
  return path.join(__dirname, "..", "..", "..", dirName);
}

export function tmpDirPath() {
  return path.join(process.cwd(), "tmp");
}
