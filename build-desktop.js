const fs = require("fs");
const { execSync } = require("child_process");

fs.copyFileSync("package.json", "package.json.bak");
const package = JSON.parse(fs.readFileSync("package.json"));
const tmpPackage = {
  ...package,
  dependencies: package.desktopBuildDependencies,
};
fs.writeFileSync("package.json", JSON.stringify(tmpPackage, null, 2));

try {
  execSync(`yarn electron-builder -mwl --ia32 --x64`, { stdio: "inherit" });
} finally {
  fs.renameSync("package.json.bak", "package.json");
}
