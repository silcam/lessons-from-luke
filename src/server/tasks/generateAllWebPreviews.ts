import PGStorage from "../storage/PGStorage";
import webifyLesson from "../actions/webifyLesson";

/*
    This script is designed to be run manually on the server
    to regenerate the web previews for each lesson.
*/

generateAllWebPreviews();

async function generateAllWebPreviews() {
  const storage = new PGStorage();
  const lessons = await storage.lessons();
  for (let i = 0; i < lessons.length; ++i) {
    console.log(
      `Generate ${lessons[i].book} ${lessons[i].series}-${lessons[i].lesson}`
    );
    const lesson = await storage.lesson(lessons[i].lessonId);
    if (lesson) await webifyLesson(lesson);
  }
  console.log("Done");
  process.exit();
}
