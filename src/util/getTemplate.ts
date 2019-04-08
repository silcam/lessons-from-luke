import fs from "fs";

export function getTemplate(name: string) {
  return fs.readFileSync(`templates/${name}.html.mustache`).toString();
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
