import { BaseLesson, Book, isTOCLesson } from "../../core/models/Lesson";
import { expectedLessonNumbers } from "../../core/models/Quarter";

/**
 * Selects the constituent lessons for a quarter assembly: the TOC lesson ∪
 * the quarter's `expectedLessonNumbers(series)` (1..13), for the given
 * `(book, series)`. Reserved cover lesson numbers (97/98 — `COVER_A4_LESSON`
 * / `COVER_A3_LESSON`) live in the same `(book, series)` as real lessons
 * (cover masters are uploaded per-book/series, not per-quarter) but are
 * never expected constituents, so they're excluded here — this is the
 * FR-012 fix (spec.md §FR-012, research.md §R3, plan.md "Risks item 3").
 * Exported so tests can exercise the real selection logic directly instead
 * of re-implementing it.
 */
export function selectAssemblyConstituents<T extends BaseLesson>(
  allLessons: readonly T[],
  book: Book,
  series: number
): T[] {
  const expected = new Set(expectedLessonNumbers(series));
  return allLessons.filter(
    (lsn) =>
      lsn.book === book && lsn.series === series && (isTOCLesson(lsn) || expected.has(lsn.lesson))
  );
}
