const fs = require("fs");

const timestamp = Date.now()
  .valueOf()
  .toString();
const assets = fs.readdirSync("public");
for (let i = 0; i < assets.length; ++i) {
  fs.renameSync(`public/${assets[i]}`, `public/${timestamp}${assets[i]}`);
}
