import Mustache from "mustache";
import fs from "fs";

interface ExtraStrings {
  uploadError?: string;
}

export default function adminHome(extraStrings: ExtraStrings = {}) {
  const template = fs
    .readFileSync("views/uploadDocForm.html.mustache")
    .toString();
  return Mustache.render(template, extraStrings);
}
