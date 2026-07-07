import makeStorage from "../storage/makeStorage";
import webifyLesson from "../actions/webifyLesson";

/*
    This script is designed to be run manually on the server
    to regenerate the web previews for each lesson.
*/

generateAllWebPreviews();

async function generateAllWebPreviews() {
  const storage = makeStorage();
  const lessons = await storage.lessons();
  console.log(
    `Generating web previews for ${lessons.length} lessons (NODE_ENV=${process.env.NODE_ENV})`
  );
  for (let i = 0; i < lessons.length; ++i) {
    console.log(`Generate ${lessons[i].book} ${lessons[i].series}-${lessons[i].lesson}`);
    const lesson = await storage.lesson(lessons[i].lessonId);
    if (lesson) await webifyLesson(lesson);
  }
  console.log("Done");
  process.exit();
}
