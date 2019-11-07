import fs from "fs";
import { assetsPath } from "../../core/util/fsUtils";

export default function staticAssetPath(filename: string) {
  const assets = fs.readdirSync(assetsPath("public"));
  const pattern = new RegExp(`\d*${filename}`);
  const matchName = assets.find(assetName => pattern.test(assetName));
  return `/${matchName || filename}`;
}
