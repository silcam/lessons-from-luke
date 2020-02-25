import { TFunc } from "../i18n/I18n";
import { LessonString } from "./LessonString";

export const AllBooks = <const>["Luke", "Acts"];
export type Book = typeof AllBooks[number];

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

export function lessonName(
  lesson: BaseLesson | undefined | null,
  t: TFunc = (s: string) => s
) {
  if (!lesson) return "";
  return `${t(lesson.book)} ${lesson.series}-${lesson.lesson}`;
}

export function lessonStringsFromLesson(lesson: BaseLesson | Lesson) {
  return "lessonStrings" in lesson ? lesson.lessonStrings : [];
}

export function lessonCompare(a: BaseLesson, b: BaseLesson) {
  const compVal = (lsn: BaseLesson) =>
    AllBooks.indexOf(lsn.book) * 10000 + lsn.series * 100 + lsn.lesson;
  return compVal(a) - compVal(b);
}
