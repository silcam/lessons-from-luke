import { Book } from "./Lesson";

/**
 * The 13 absolute lesson numbers that make up a quarter (series).
 * Series 1 → 1..13, series 2 → 14..26, etc.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.1.1;
 * real implementation lands in lessons-from-luke-koog.6.1.2.
 */
export function expectedLessonNumbers(_series: number): number[] {
  throw new Error("not implemented");
}

/**
 * Whether the given (book, series) quarter is complete: the TOC lesson and
 * all 13 expected lesson numbers are present among `lessons`.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.1.1.
 */
export function isCompleteQuarter(
  _book: Book,
  _series: number,
  _lessons: readonly { book: Book; series: number; lesson: number }[]
): boolean {
  throw new Error("not implemented");
}

/**
 * The human-readable names (e.g. "Luke 1-6", "Luke 2-TOC") of the parts of a
 * (book, series) quarter missing from `lessons`. Empty when complete.
 *
 * NOT YET IMPLEMENTED — stub for RED task lessons-from-luke-koog.6.1.1.
 */
export function missingQuarterParts(
  _book: Book,
  _series: number,
  _lessons: readonly { book: Book; series: number; lesson: number }[]
): string[] {
  throw new Error("not implemented");
}
