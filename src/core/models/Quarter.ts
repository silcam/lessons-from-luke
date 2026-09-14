import { Book, BaseLesson, TOC_LESSON, isTOCLesson, lessonName } from "./Lesson";

const LESSONS_PER_QUARTER = 13;

/**
 * The 13 absolute lesson numbers that make up a quarter (series).
 * Series 1 → 1..13, series 2 → 14..26, etc.
 */
export function expectedLessonNumbers(series: number): number[] {
  const first = (series - 1) * LESSONS_PER_QUARTER + 1;
  return Array.from({ length: LESSONS_PER_QUARTER }, (_, i) => first + i);
}

function quarterLessons(
  book: Book,
  series: number,
  lessons: readonly BaseLesson[]
): readonly BaseLesson[] {
  return lessons.filter((lsn) => lsn.book === book && lsn.series === series);
}

/**
 * The human-readable names (e.g. "Luke 1-6", "Luke 2-TOC") of the parts of a
 * (book, series) quarter missing from `lessons`. Empty when complete.
 */
export function missingQuarterParts(
  book: Book,
  series: number,
  lessons: readonly BaseLesson[]
): string[] {
  const present = quarterLessons(book, series, lessons);
  const hasTOC = present.some(isTOCLesson);
  const presentLessonNumbers = new Set(
    present.filter((lsn) => !isTOCLesson(lsn)).map((lsn) => lsn.lesson)
  );

  const missing: string[] = [];
  if (!hasTOC) {
    missing.push(lessonName({ book, series, lesson: TOC_LESSON, lessonId: 0, version: 0 }));
  }
  for (const lessonNumber of expectedLessonNumbers(series)) {
    if (!presentLessonNumbers.has(lessonNumber)) {
      missing.push(lessonName({ book, series, lesson: lessonNumber, lessonId: 0, version: 0 }));
    }
  }
  return missing;
}

/**
 * Whether the given (book, series) quarter is complete: the TOC lesson and
 * all 13 expected lesson numbers are present among `lessons`.
 */
export function isCompleteQuarter(
  book: Book,
  series: number,
  lessons: readonly BaseLesson[]
): boolean {
  return missingQuarterParts(book, series, lessons).length === 0;
}
