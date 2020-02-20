import { TFunc } from "../i18n/I18n";
import { LessonString } from "./LessonString";

export type Book = "Luke" | "Acts";

export interface BaseLesson {
  lessonId: number;
  book: Book;
  series: number;
  lesson: number;
  version: number;
}

export interface Lesson extends BaseLesson {
  lessonStrings: LessonString[];
}
export type DraftLesson = Omit<BaseLesson, "lessonId" | "version">;

export function lessonName(lesson: BaseLesson, t: TFunc = (s: string) => s) {
  return `${t(lesson.book)} ${lesson.series}-${lesson.lesson}`;
}

export function lessonStringsFromLesson(lesson: BaseLesson | Lesson) {
  return "lessonStrings" in lesson ? lesson.lessonStrings : [];
}
