const fs = require("fs");
const path = require("path");

const src = path.join("test", "docs", "serverDocs");
const dst = path.join("docs", "dev");
fs.mkdirSync(dst, { recursive: true });

const files = fs
  .readdirSync(src)
  .filter((f) => /v03\.odt$/.test(f))
  .filter((f) => fs.statSync(path.join(src, f)).isFile());

for (const f of files) {
  const out = path.join(dst, f);
  if (fs.existsSync(out) && !process.argv.includes("--force")) {
    console.log(`skip (exists): ${out}`);
    continue;
  }
  fs.copyFileSync(path.join(src, f), out);
  console.log(`copied: ${out}`);
}
