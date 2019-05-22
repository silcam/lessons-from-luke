import fs from "fs";
import child_process from "child_process";

export function mkdirSafe(path: string) {
  if (!fs.existsSync(path)) fs.mkdirSync(path);
}

export function unzip(inPath: string, outPath: string) {
  child_process.execSync(`unzip "${inPath}" -d "${outPath}"`);
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
        copyRecursive(`${from}/${filename}`, `${to}/${filename}`);
      });
    } else {
      fs.copyFileSync(from, to);
    }
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export function unlinkRecursive(path: string) {
  // console.log(`Unlink ${path}`);
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
