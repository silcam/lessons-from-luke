import fs from "fs";
import encode from "../util/timestampEncode";

const projectsJson = "strings/projects.json";

interface ProjectParams {
  sourceLang?: string;
  targetLang?: string;
}

export default function createProject(params: ProjectParams) {
  if (!params.sourceLang || !params.targetLang) return false;

  let projects = JSON.parse(fs.readFileSync(projectsJson).toString());
  const projectCode = encode(); // Project code based on current datetime
  projects.push({
    code: projectCode,
    sourceLang: params.sourceLang,
    targetLang: params.targetLang
  });
}
