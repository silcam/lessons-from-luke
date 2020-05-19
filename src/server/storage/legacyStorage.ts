import fs from "fs";
import { LegacyProject, LegacyTString } from "../../core/models/Legacy";

export function legacyProjects(): LegacyProject[] {
  const projectsJsonPath = `${legacyStringsDirPath()}/projects.json`;
  const projects: LegacyProject[] = JSON.parse(
    fs.readFileSync(projectsJsonPath).toString()
  );
  return projects.filter(prj => prj.sourceLang == "Français");
}

export function legacyTStrings(project: LegacyProject): LegacyTString[] {
  const projectDirPath = `${legacyStringsDirPath()}/translations/${
    project.targetLang
  }_${project.datetime}`;
  let tStrings: LegacyTString[] = [];
  const dirFilenames = fs.readdirSync(projectDirPath);
  dirFilenames.forEach(filename => {
    if (filename.endsWith(".json")) {
      const lessonTStrings: LegacyTString[] = JSON.parse(
        fs.readFileSync(`${projectDirPath}/${filename}`).toString()
      );
      tStrings = tStrings.concat(
        lessonTStrings.filter(tStr => tStr.targetText.length > 0)
      );
    }
  });
  return tStrings;
}

function legacyStringsDirPath() {
  return process.env.NODE_ENV == "test"
    ? `${process.cwd()}/strings`
    : `/var/www/luke-lessons/shared/strings`;
}
