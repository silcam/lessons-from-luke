import * as Storage from "../util/Storage";
import fs from "fs";
import Mustache from "mustache";

export default function docStrings(lessonId: Storage.LessonId) {
  const template = fs
    .readFileSync("templates/editSrcStrings.html.mustache")
    .toString();
  const srcStrings = Storage.getSrcStrings(lessonId);
  return Mustache.render(template, { srcStrings });
}
