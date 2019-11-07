import Mustache from "mustache";
import { getTemplate } from "../getTemplate";
import { SourceLessonId } from "../../core/Source";
import { getSrcStrings } from "../FileStorage";

export default function docStrings(lessonId: SourceLessonId) {
  const template = getTemplate("editSrcStrings");
  const srcStrings = getSrcStrings(lessonId).map((src, index) => ({
    ...src,
    id: index
  }));
  return Mustache.render(template, {
    srcStrings,
    submitUrl: `/sources/${lessonId.language}/lessons/${lessonId.lesson}/versions/${lessonId.version}`
  });
}
