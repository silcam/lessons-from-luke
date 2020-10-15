import { TFunc } from "../i18n/I18n";
import { LessonString } from "./LessonString";
import { zeroPad } from "../util/numberUtils";

export const AllBooks = <const>["Luke", "Acts"];
export type Book = typeof AllBooks[number];

export const TOC_LESSON = 99;

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
  return isTOCLesson(lesson)
    ? `${t(lesson.book)} ${lesson.series}-TOC`
    : `${t(lesson.book)} ${lesson.series}-${lesson.lesson}`;
}

export function documentName(languageName: string, lesson: BaseLesson) {
  console.log("DOCNAME!!");
  return (
    `${languageName}_${lesson.book}-Q${lesson.series}-` +
    (isTOCLesson(lesson) ? "TOC.odt" : `L${zeroPad(lesson.lesson, 2)}.odt`)
  );
}

export function lessonStringsFromLesson(lesson: BaseLesson | Lesson) {
  return "lessonStrings" in lesson ? lesson.lessonStrings : [];
}

export function lessonCompare(a: BaseLesson, b: BaseLesson) {
  const compVal = (lsn: BaseLesson) =>
    AllBooks.indexOf(lsn.book) * 10000 + lsn.series * 100 + lsn.lesson;
  return compVal(a) - compVal(b);
}

export function isTOCLesson(lesson: BaseLesson) {
  return lesson.lesson == TOC_LESSON;
}
