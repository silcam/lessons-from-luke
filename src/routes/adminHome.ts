import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { getTemplates } from "../util/getTemplate";
import * as Manifest from "../util/Manifest";

interface ExtraStrings {
  uploadError?: string;
}

export default function adminHome(extraStrings: ExtraStrings = {}) {
  const sourceManifest = Manifest.readSourceManifest();
  const sourceLangs = sourceManifest
    .map(langManifest => langManifest.language)
    .sort();
  return Mustache.render(
    getTemplate("adminHome"),
    { ...extraStrings, sourceLangs },
    getTemplates(["createProjectForm", "uploadDocForm"])
  );
}
