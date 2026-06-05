// Builds the Electron desktop app with a trimmed-down production dependency
// set (the `desktopBuildDependencies` field in package.json).
//
// Under Yarn Berry, electron-builder enumerates production dependencies from
// Yarn's authoritative view (lockfile + .yarn/install-state.gz), not by
// reading the package.json on disk at build time. So an in-place package.json
// swap is invisible to electron-builder. Instead we stage a minimal project
// in a sibling directory, run `yarn install` there to produce a matching
// install-state, and invoke electron-builder against the stage.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const STAGE = path.join(ROOT, ".desktop-build-stage");

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE);

const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

const stagePackage = {
  name: rootPackage.name,
  productName: rootPackage.productName,
  description: rootPackage.description,
  author: rootPackage.author,
  version: rootPackage.version,
  license: rootPackage.license,
  main: rootPackage.main,
  build: rootPackage.build,
  dependencies: rootPackage.desktopBuildDependencies,
  devDependencies: {
    electron: rootPackage.devDependencies.electron,
    "electron-builder": rootPackage.devDependencies["electron-builder"],
  },
  packageManager: rootPackage.packageManager,
};

fs.writeFileSync(path.join(STAGE, "package.json"), JSON.stringify(stagePackage, null, 2));

fs.copyFileSync(path.join(ROOT, "yarn.lock"), path.join(STAGE, "yarn.lock"));
fs.copyFileSync(path.join(ROOT, ".yarnrc.yml"), path.join(STAGE, ".yarnrc.yml"));
fs.cpSync(path.join(ROOT, ".yarn", "releases"), path.join(STAGE, ".yarn", "releases"), {
  recursive: true,
});

fs.cpSync(path.join(ROOT, "dist"), path.join(STAGE, "dist"), {
  recursive: true,
});

execSync("yarn install", { cwd: STAGE, stdio: "inherit" });
execSync("yarn electron-builder -mwl --x64", {
  cwd: STAGE,
  stdio: "inherit",
});

fs.rmSync(path.join(ROOT, "dist-desktop"), { recursive: true, force: true });
fs.renameSync(path.join(STAGE, "dist-desktop"), path.join(ROOT, "dist-desktop"));
