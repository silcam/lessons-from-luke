/**
 * detectLesson.ts — FR-002 affected-lesson detection, `bumpCount`
 * computation, and mapping-strategy selection for the `restoreLesson` task
 * (spec 018-lesson1-translation-restore).
 *
 * Joins a `(book, series, lesson)` identity across both databases — never
 * `lessonId`, which is a per-database serial and is not assumed equal
 * across production and the Snapshot (see `gateway.ts`'s
 * `fetchLessonByBookSeriesLesson`, the caller's I/O source for
 * `productionLesson` / `snapshotLesson` below).
 *
 * `bumpCount = productionVersion - snapshotVersion` selects the mapping
 * strategy (research D3): `findTSubsBridge` when `bumpCount === 1`,
 * `snapshotAnchored` otherwise. No match on either side aborts (exit 13).
 *
 * `expectedBumpCount` is a caller-supplied fact, not assumed here: 1 for a
 * first diagnosis, or `1 + (versions bumped by this tool)` for a
 * re-diagnosis carried forward via `--prior-report` (plan.md §Drift
 * severity, and re-diagnosing after drift). A measured/expected mismatch is
 * a loud warning, never an abort — only the legitimate drift-recovery
 * `bumpCount === 2` case must NOT trigger it.
 *
 * Spec: specs/018-lesson1-translation-restore/spec.md FR-002,
 * specs/018-lesson1-translation-restore/plan.md §Known incident version
 * facts table, §Drift severity section, research D3.
 */
import { BaseLesson, Book } from "../../../core/models/Lesson";
import { RestoreLessonAbortError } from "./identity";
import { AffectedLesson, MappingStrategy, MasterDocumentCandidate } from "./types";

export interface DetectAffectedLessonInput {
  book: Book;
  series: number;
  lesson: number;
  /** fetched via `gateway.ts`'s `fetchLessonByBookSeriesLesson` against production; null = no match.
   * `modified` (ms) dates the bad upload — diagnosis runs while it is the current version. */
  productionLesson: (BaseLesson & { modified?: number }) | null;
  /** fetched via `gateway.ts`'s `fetchLessonByBookSeriesLesson` against the Snapshot; null = no match */
  snapshotLesson: BaseLesson | null;
  /** pinned at first diagnosis, or carried forward via `--prior-report` */
  knownBadVersions: number[];
  /** 1 for a first diagnosis; `1 + versions this tool bumped` for a re-diagnosis */
  expectedBumpCount: number;
  candidateMasterDocuments: MasterDocumentCandidate[];
}

export interface DetectAffectedLessonResult {
  affectedLesson: AffectedLesson;
  /** non-null iff the measured `bumpCount` unexpectedly diverges from `expectedBumpCount` */
  bumpCountWarning: string | null;
}

/**
 * Detects the affected lesson by joining `(book, series, lesson)` across
 * production and the Snapshot, computes `bumpCount`, and selects the
 * mapping strategy. Throws `RestoreLessonAbortError(13, ...)` when either
 * side has no matching lesson.
 */
export function detectAffectedLesson(input: DetectAffectedLessonInput): DetectAffectedLessonResult {
  if (!input.productionLesson || !input.snapshotLesson) {
    throw new RestoreLessonAbortError(
      13,
      `No affected lesson detected for (book=${input.book}, series=${input.series}, ` +
        `lesson=${input.lesson}): ` +
        `${!input.productionLesson ? "no matching production lesson" : "matched on production"}, ` +
        `${!input.snapshotLesson ? "no matching Snapshot lesson" : "matched on Snapshot"}.`
    );
  }

  const bumpCount = input.productionLesson.version - input.snapshotLesson.version;
  const mappingStrategy: MappingStrategy = bumpCount === 1 ? "findTSubsBridge" : "snapshotAnchored";

  const affectedLesson: AffectedLesson = {
    book: input.book,
    series: input.series,
    lesson: input.lesson,
    productionLessonId: input.productionLesson.lessonId,
    snapshotLessonId: input.snapshotLesson.lessonId,
    productionVersion: input.productionLesson.version,
    snapshotVersion: input.snapshotLesson.version,
    bumpCount,
    mappingStrategy,
    knownBadVersions: input.knownBadVersions,
    expectedBumpCount: input.expectedBumpCount,
    productionLessonModified: input.productionLesson.modified ?? null,
    candidateMasterDocuments: input.candidateMasterDocuments,
  };

  const bumpCountWarning =
    bumpCount !== input.expectedBumpCount
      ? `bumpCount ${bumpCount} does not match expected bumpCount ${input.expectedBumpCount} ` +
        `for (book=${input.book}, series=${input.series}, lesson=${input.lesson}); stop and re-review ` +
        `before proceeding (production version ${input.productionLesson.version}, Snapshot version ` +
        `${input.snapshotLesson.version}).`
      : null;

  return { affectedLesson, bumpCountWarning };
}
