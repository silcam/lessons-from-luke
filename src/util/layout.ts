import fs from "fs";
import Mustache from "mustache";

export default function layout(content: string) {
  const layoutTemplate = fs
    .readFileSync("views/layout.html.mustache")
    .toString();
  return Mustache.render(layoutTemplate, { content });
}
