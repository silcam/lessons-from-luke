import PGStorage from "../storage/PGStorage";
import { lessonName, BaseLesson } from "../../core/models/Lesson";
import { parseDocStrings, saveDocStrings } from "../actions/updateLesson";
import docStorage from "../storage/docStorage";
import { Persistence } from "../../core/interfaces/Persistence";
import { splitReferencesInDocument } from "../xml/referenceSplitter";
import fs from "fs";

/*
    This script is designed to be run manually on the server when a change to the parse
    algorithm requires reparsing all the existing doc files.
*/

if (require.main === module) {
  reparseEnglish();
}

export async function reparseEnglish(storage: Persistence = new PGStorage()) {
  const lessons = await storage.lessons();
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < lessons.length; ++i) {
    const lesson = lessons[i];
    console.log(`Reparse ${lessonName(lesson)}...`);
    try {
      await reparseLesson(lesson, storage);
      succeeded++;
    } catch (error) {
      failed++;
      console.log(`Reparse ${lessonName(lesson)} (lessonId=${lesson.lessonId}) failed: ${error}`);
    }
  }
  console.log(`Summary: Done: ${succeeded} succeeded, ${failed} failed`);
}

export async function reparseLesson(lesson: BaseLesson, storage: Persistence) {
  const newVersion = lesson.version + 1;
  const oldDocFilepath = docStorage.docFilepath(lesson);
  const newDocFilepath = docStorage.docFilepath({
    ...lesson,
    version: newVersion,
  });
  fs.copyFileSync(oldDocFilepath, newDocFilepath);
  splitReferencesInDocument(newDocFilepath, newDocFilepath);
  const docStrings = parseDocStrings(newDocFilepath);
  await saveDocStrings(lesson.lessonId, newVersion, docStrings, storage);
}
