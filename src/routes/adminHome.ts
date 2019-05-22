import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { getTemplates } from "../util/getTemplate";
import * as Manifest from "../util/Manifest";
import { encode } from "../util/timestampEncode";
import { projectIdToString } from "../util/Storage";

export default function adminHome() {
  const sourceManifest = Manifest.readSourceManifest();
  const projects = Manifest.readProjectManifest();
  const sourceLangs = sourceManifest
    .map(langManifest => langManifest.language)
    .sort();
  return Mustache.render(
    getTemplate("adminHome"),
    { sourceLangs, projects, projectCode, projectId },
    getTemplates(["sourceLangList", "projectList"])
  );
}

function projectCode() {
  return encode(this.datetime);
}

function projectId() {
  return projectIdToString(this);
}
