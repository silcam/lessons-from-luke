import { TFunc } from "../i18n/I18n";

export type Book = "Luke" | "Acts";

export interface Lesson {
  lessonId: number;
  book: Book;
  series: number;
  lesson: number;
}

export function lessonName(lesson: Lesson, t: TFunc = (s: string) => s) {
  return `${t(lesson.book)} ${lesson.series}-${lesson.lesson}`;
}
