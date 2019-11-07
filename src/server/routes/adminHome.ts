import Mustache from "mustache";
import { getTemplate } from "../getTemplate";
import { getTemplates } from "../getTemplate";
import { encode } from "../../core/util/timestampEncode";
import { projectIdToString, Project } from "../../core/Project";
import { extraProgressClass } from "../controllers/translateController";
import { readSourceManifest, readProjectManifest } from "../FileStorage";

export default function adminHome() {
  const sourceManifest = readSourceManifest();
  const projects = readProjectManifest();
  const regularProjects = projects
    .filter(p => !p.fullTranslation)
    .sort(compareProjects);
  const fullTransProjects = projects
    .filter(p => p.fullTranslation)
    .sort(compareProjects);
  const sourceLangs = sourceManifest
    .map(langManifest => langManifest.language)
    .sort();
  return Mustache.render(
    getTemplate("adminHome"),
    {
      sourceLangs,
      projects: regularProjects,
      fullTransProjects,
      showFullTransProjects: fullTransProjects.length > 0,
      projectCode,
      projectId,
      projectProgress,
      projectLocked,
      extraProgressClass
    },
    getTemplates(["sourceLangList", "projectList", "projectListItem"])
  );
}

function projectCode() {
  return encode(this.datetime);
}

function projectId() {
  return projectIdToString(this);
}

function projectProgress() {
  const project: Project = this;
  const percentSum = project.lessons.reduce(
    (sum, lesson) => sum + (lesson.progress || 0),
    0
  );
  return percentSum == 0
    ? ""
    : `${Math.round(percentSum / project.lessons.length)}%`;
}

function projectLocked() {
  const project: Project = this;
  return project.lockCode !== undefined;
}

function compareProjects(a: Project, b: Project) {
  return a.targetLang.localeCompare(b.targetLang);
}
