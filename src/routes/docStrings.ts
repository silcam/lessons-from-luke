import * as Storage from "../util/Storage";
import fs from "fs";
import Mustache from "mustache";

export default function docStrings(lessonId: Storage.LessonId) {
  const template = fs
    .readFileSync("templates/editSrcStrings.html.mustache")
    .toString();
  const srcStrings = Storage.getSrcStrings(lessonId).map((src, index) => ({
    ...src,
    id: index
  }));
  return Mustache.render(template, {
    srcStrings,
    submitUrl: `/sources/${lessonId.language}/lessons/${
      lessonId.lesson
    }/versions/${lessonId.version}`
  });
}
