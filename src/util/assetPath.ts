import fs from "fs";

export default function assetPath(filename: string) {
  console.log("Asset path");
  const assets = fs.readdirSync("public");
  console.log(assets.join(", "));
  const pattern = new RegExp(`\d*${filename}`);
  const matchName = assets.find(assetName => pattern.test(assetName));
  return `/${matchName || filename}`;
}
