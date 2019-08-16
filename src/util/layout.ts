import Mustache from "mustache";
import { getTemplate } from "./getTemplate";
import staticAssetPath from "./assetPath";

export default function layout(content: string) {
  const cssPath = staticAssetPath("lessons.css");
  return Mustache.render(getTemplate("layout"), { content, cssPath });
}
