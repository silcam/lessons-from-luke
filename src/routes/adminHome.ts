import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";
import { getTemplates } from "../util/getTemplate";
import * as Manifest from "../util/Manifest";
import { encode } from "../util/timestampEncode";
import { projectIdToString } from "../util/Storage";
import { extraProgressClass } from "../controllers/translateController";

export default function adminHome() {
  const sourceManifest = Manifest.readSourceManifest();
  const projects = Manifest.readProjectManifest();
  const sourceLangs = sourceManifest
    .map(langManifest => langManifest.language)
    .sort();
  return Mustache.render(
    getTemplate("adminHome"),
    {
      sourceLangs,
      projects,
      projectCode,
      projectId,
      projectProgress,
      projectLocked,
      extraProgressClass
    },
    getTemplates(["sourceLangList", "projectList"])
  );
}

function projectCode() {
  return encode(this.datetime);
}

function projectId() {
  return projectIdToString(this);
}

function projectProgress() {
  const project: Manifest.Project = this;
  const percentSum = project.lessons.reduce(
    (sum, lesson) => sum + (lesson.progress || 0),
    0
  );
  return percentSum == 0
    ? ""
    : `${Math.round(percentSum / project.lessons.length)}%`;
}

function projectLocked() {
  const project: Manifest.Project = this;
  return project.lockCode !== undefined;
}
