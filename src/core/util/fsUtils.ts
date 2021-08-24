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

export function unzip(inPath: string, outPath: string) {
  child_process.execSync(`unzip -o "${inPath}" -d "${outPath}"`);
}

export function zip(srcDir: string, outPath: string) {
  const tmpzip = ".tmpzip.zip";
  child_process.execSync(`cd "${srcDir}" && zip -r "${tmpzip}" ./*`);
  fs.renameSync(`${srcDir}/${tmpzip}`, outPath);
}

export function copyRecursive(from: string, to: string) {
  // console.log(`Copy to ${to}`);
  try {
    if (fs.statSync(from).isDirectory()) {
      mkdirSafe(to);
      fs.readdirSync(from).forEach(filename => {
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
      fs.readdirSync(filepath).forEach(filename => {
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
