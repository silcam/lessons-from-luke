import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { getTemplates } from "../util/getTemplate";
import * as Manifest from "../util/Manifest";
import { encode } from "../util/timestampEncode";

export default function adminHome() {
  const sourceManifest = Manifest.readSourceManifest();
  const projects = Manifest.readProjectManifest();
  const sourceLangs = sourceManifest
    .map(langManifest => langManifest.language)
    .sort();
  return Mustache.render(
    getTemplate("adminHome"),
    { sourceLangs, projects, projectCode },
    getTemplates(["sourceLangList", "projectList"])
  );
}

function projectCode() {
  return encode(this.datetime);
}
