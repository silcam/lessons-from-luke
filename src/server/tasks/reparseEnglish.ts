import PGStorage from "../storage/PGStorage";
import { lessonName, BaseLesson } from "../../core/models/Lesson";
import { parseDocStrings, saveDocStrings } from "../actions/updateLesson";
import docStorage from "../storage/docStorage";
import { Persistence } from "../../core/interfaces/Persistence";
import fs from "fs";

/*
    This script is designed to be run manually on the server when a change to the parse
    algorithm requires reparsing all the existing doc files.
*/

reparseEnglish();

async function reparseEnglish() {
  const storage = new PGStorage();
  const lessons = await storage.lessons();
  for (let i = 0; i < lessons.length; ++i) {
    const lesson = lessons[i];
    console.log(`Reparse ${lessonName(lesson)}...`);
    await reparseLesson(lesson, storage);
  }
  console.log("Done");
}

async function reparseLesson(lesson: BaseLesson, storage: Persistence) {
  const newVersion = lesson.version + 1;
  const oldDocFilepath = docStorage.docFilepath(lesson);
  const newDocFilepath = docStorage.docFilepath({
    ...lesson,
    version: newVersion
  });
  fs.copyFileSync(oldDocFilepath, newDocFilepath);
  const docStrings = parseDocStrings(newDocFilepath);
  await saveDocStrings(lesson.lessonId, newVersion, docStrings, storage);
}
