import fs from "fs";
import child_process from "child_process";

export function mkdirSafe(path: string) {
  if (!fs.existsSync(path)) fs.mkdirSync(path);
}

export function unzip(inPath: string, outPath: string) {
  child_process.execSync(`unzip "${inPath}" -d "${outPath}"`);
}
