import { TFunc } from "../i18n/I18n";
import { LessonString } from "./LessonString";
import { zeroPad } from "../util/numberUtils";

export const AllBooks = <const>["Luke", "Acts"];
export type Book = (typeof AllBooks)[number];

export const TOC_LESSON = 99;

/** Reserved lesson number for the A4 (cut-sheet) cover. */
export const COVER_A4_LESSON = 97;
/** Reserved lesson number for the A3 (full-spread booklet) cover. */
export const COVER_A3_LESSON = 98;

/** The two supported cover print formats. */
export type CoverFormat = "A4" | "A3";

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

export function lessonName(lesson: BaseLesson | undefined | null, t: TFunc = (s: string) => s) {
  if (!lesson) return "";
  const format = coverFormat(lesson.lesson);
  if (format) return t(format === "A4" ? "Cover (A4)" : "Cover (A3)");
  return isTOCLesson(lesson)
    ? `${t(lesson.book)} ${lesson.series}-TOC`
    : `${t(lesson.book)} ${lesson.series}-${lesson.lesson}`;
}

export function documentName(languageName: string, lesson: BaseLesson) {
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

/**
 * True iff the given lesson number is one of the reserved cover lesson
 * numbers (A4 or A3).
 */
export function isCoverLesson(lesson: number): boolean {
  return lesson === COVER_A4_LESSON || lesson === COVER_A3_LESSON;
}

/**
 * The cover format for a reserved cover lesson number, or `null` if the
 * given lesson number is not a reserved cover lesson number.
 */
export function coverFormat(lesson: number): CoverFormat | null {
  if (lesson === COVER_A4_LESSON) return "A4";
  if (lesson === COVER_A3_LESSON) return "A3";
  return null;
}
