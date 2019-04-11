import fs from "fs";
import child_process from "child_process";

export function mkdirSafe(path: string) {
  if (!fs.existsSync(path)) fs.mkdirSync(path);
}

export function unzip(inPath: string, outPath: string) {
  child_process.execSync(`unzip "${inPath}" -d "${outPath}"`);
}

export function copyRecursive(from: string, to: string) {
  fs.copyFileSync(from, to);
  if (fs.statSync(from).isDirectory()) {
    fs.readdirSync(from).forEach(filename => {
      copyRecursive(`${from}/${filename}`, `${to}/${filename}`);
    });
  }
}

export function unlinkRecursive(path: string) {
  if (fs.existsSync(path)) {
    if (fs.statSync(path).isDirectory()) {
      fs.readdirSync(path).forEach(filename => {
        unlinkRecursive(`${path}/${filename}`);
      });
      fs.rmdirSync(path);
    } else {
      fs.unlinkSync(path);
    }
  }
}
