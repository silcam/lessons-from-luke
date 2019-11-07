import fs from "fs";
import path from "path";
import { assetsPath } from "../core/util/fsUtils";

export function getTemplate(name: string) {
  return fs
    .readFileSync(path.join(assetsPath("templates"), `${name}.html.mustache`))
    .toString();
}

interface TemplateMap {
  [templateName: string]: string;
}
export function getTemplates(names: string[]): TemplateMap {
  return names.reduce(
    (accum, name) => ({
      ...accum,
      [name]: getTemplate(name)
    }),
    {}
  );
}
