import * as Storage from "../util/Storage";
import Mustache from "mustache";
import { getTemplate } from "../util/getTemplate";

export default function docStrings(lessonId: Storage.LessonId) {
  const template = getTemplate("editSrcStrings");
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
