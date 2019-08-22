import fs from "fs";
import { unlinkSafe, unlinkRecursive } from "../util/fsUtils";
import { zip } from "../util/fsUtils";

const srcDirPath = "strings/src";
const srcLangs = fs.readdirSync(srcDirPath);
srcLangs.forEach(lang => {
  const langDirPath = `${srcDirPath}/${lang}`;
  const lessons = fs.readdirSync(langDirPath);
  lessons.forEach(lesson => {
    console.log(lesson);
    const lessonDirPath = `${langDirPath}/${lesson}`;
    const docName = lesson.replace(/_\w+$/, ".odt");
    const docPath = `${lessonDirPath}/${docName}`;
    const odtDirPath = `${lessonDirPath}/odt`;
    unlinkSafe(docPath);
    zip(odtDirPath, docPath);
    unlinkRecursive(odtDirPath);
  });
});
