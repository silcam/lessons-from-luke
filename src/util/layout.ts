import Mustache from "mustache";
import { getTemplate } from "./getTemplate";
import assetPath from "./assetPath";

export default function layout(content: string) {
  const cssPath = assetPath("lessons.css");
  return Mustache.render(getTemplate("layout"), { content, cssPath });
}
