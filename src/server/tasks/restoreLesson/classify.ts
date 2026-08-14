/**
 * classify.ts — FR-008 conflict classification, and FR-004 blast radius
 * assembly, for the `restoreLesson` task (spec 018-lesson1-translation-restore).
 *
 * `classifyFindings` decides, per (language, mapped master string), one of
 * the five `TranslationClassification` outcomes (research D7). Value
 * comparison is PRIMARY; `modified` timestamps are evidence carried onto the
 * finding only — a NULL `modified` on either side never aborts or skips a
 * pair, it simply falls back to the text comparison that already drives the
 * decision. A mapping with no production counterpart (`matchMethod ===
 * "unmatched"`, `productionMasterId === null`) can never classify as
 * `restore`: data-model.md's `MasterStringMapping` validation states
 * unmatched entries "are reported and never written", and
 * `RestoreWrite.masterId` is non-nullable, so there is no valid write target
 * regardless of what the Snapshot holds. It CAN still classify as `conflict`
 * (FR-008: a divergence "regardless of reachability") when the master
 * string's own now-orphaned `tstrings` row — still keyed by
 * `snapshotMasterId` in the same-id-space `findTSubsBridge` regime — was
 * edited after the Snapshot; absent that evidence, it falls back to `lost`.
 *
 * `assembleBlastRadius` turns `gateway.ts`'s `fetchLessonsSharingMasterIds`
 * result into `DiagnosisReport.blastRadius` (FR-004): the count of the
 * affected lesson's own master IDs that are *also* referenced by some other
 * lesson, plus the deduplicated list of those other lessons.
 *
 * Pure function — no I/O — per research D11's pure-diagnosis-core design;
 * the caller fetches `tstrings` rows via `gateway.ts`.
 *
 * Spec: specs/018-lesson1-translation-restore/spec.md FR-008, FR-004,
 * specs/018-lesson1-translation-restore/plan.md §Client-reported claims,
 * research D7, data-model.md TranslationClassification / TranslationFinding.
 */
import { Language } from "../../../core/models/Language";
import { TString } from "../../../core/models/TString";
import { MasterIdLessons } from "../../storage/PGRestoreLessonGatewayStorage";
import {
  LessonRef,
  MasterStringMapping,
  TranslationClassification,
  TranslationFinding,
} from "./types";

/**
 * A production `tstrings` row as `gateway.ts` must eventually fetch it,
 * including the `modified` column (D7's evidence-only field) that the
 * `TString` domain model omits because it is server-storage-specific.
 *
 * NOTE: `gateway.ts`'s `fetchTStringsForLesson` does not yet `SELECT
 * modified` — the task wiring `classifyFindings` into `diagnose.ts` must
 * extend that query to include it.
 */
export interface ProductionTStringRow extends TString {
  modified: number | null;
}

export interface ClassifyFindingsInput {
  /** the affected lesson's pre-incident master-string mapping (FR-003) */
  mappings: MasterStringMapping[];
  /** languages in scope for classification; caller decides inclusion (I7: include archived) */
  languages: Language[];
  /** Snapshot's tstrings for this lesson's snapshot masterIds, any language */
  snapshotTStrings: TString[];
  /** Production's tstrings for this lesson's production masterIds, any language */
  productionTStrings: ProductionTStringRow[];
}

/**
 * Classifies every (language, mapped master string) pair per the research
 * D7 decision table. Emits one `TranslationFinding` per `mappings` entry per
 * `languages` entry.
 */
export function classifyFindings(input: ClassifyFindingsInput): TranslationFinding[] {
  const findings: TranslationFinding[] = [];
  for (const mapping of input.mappings) {
    for (const language of input.languages) {
      findings.push(
        classifyOne(mapping, language, input.snapshotTStrings, input.productionTStrings)
      );
    }
  }
  return findings;
}

function classifyOne(
  mapping: MasterStringMapping,
  language: Language,
  snapshotTStrings: TString[],
  productionTStrings: ProductionTStringRow[]
): TranslationFinding {
  const snapshotRow = snapshotTStrings.find(
    (t) => t.masterId === mapping.snapshotMasterId && t.languageId === language.languageId
  );
  const snapshotText = snapshotRow?.text ?? null;

  let productionText: string | null = null;
  let productionModified: number | null = null;
  let legacyLessonStringId: number | null = null;

  if (mapping.productionMasterId !== null) {
    const matches = productionTStrings.filter(
      (t) => t.masterId === mapping.productionMasterId && t.languageId === language.languageId
    );
    // The masterId-scoped row (lessonStringId null) is the canonical
    // production value; a legacy lessonStringId-scoped row for the same
    // pair is the second orphan vector — recorded, but not the value used
    // for comparison.
    const canonical = matches.find((t) => t.lessonStringId == null) ?? matches[0];
    if (canonical) {
      productionText = canonical.text;
      productionModified = canonical.modified;
    }
    const legacy = matches.find((t) => t.lessonStringId != null);
    if (legacy) {
      legacyLessonStringId = legacy.lessonStringId ?? null;
    }
  } else {
    // No live counterpart was found to re-attach into (no valid
    // `RestoreWrite` target — FR-007), but FR-008 requires surfacing a
    // genuine value divergence "regardless of reachability": the master
    // string's own now-orphaned `tstrings` row, still keyed by
    // `snapshotMasterId` in the `findTSubsBridge` same-id-space regime (and
    // still present among `productionTStrings` via `cli.ts`'s
    // `candidateMasterIds`), can carry real evidence that it was edited in
    // production after the Snapshot even though nothing currently maps to
    // it. A divergence there must classify as `conflict`, not be silently
    // dropped as `lost`.
    const orphanedMatches = productionTStrings.filter(
      (t) => t.masterId === mapping.snapshotMasterId && t.languageId === language.languageId
    );
    const canonical = orphanedMatches.find((t) => t.lessonStringId == null) ?? orphanedMatches[0];
    if (canonical) {
      productionText = canonical.text;
      productionModified = canonical.modified;
    }
    const legacy = orphanedMatches.find((t) => t.lessonStringId != null);
    if (legacy) {
      legacyLessonStringId = legacy.lessonStringId ?? null;
    }
  }

  const classification = classifyPair(mapping.productionMasterId, productionText, snapshotText);

  return {
    languageId: language.languageId,
    languageName: language.name,
    languageArchived: language.archived,
    snapshotMasterId: mapping.snapshotMasterId,
    productionMasterId: mapping.productionMasterId,
    classification,
    snapshotText,
    productionText,
    productionModified,
    legacyLessonStringId,
    sampleEnglishText: mapping.englishText,
  };
}

function classifyPair(
  productionMasterId: number | null,
  productionText: string | null,
  snapshotText: string | null
): TranslationClassification {
  if (productionMasterId === null) {
    // Still no valid write target (RestoreWrite.masterId is non-nullable),
    // so this can never become `restore` — but a divergence recorded on the
    // orphaned original row is real evidence of a conflicting edit (FR-008)
    // and must be reported as such rather than silently as `lost`.
    if (productionText !== null && snapshotText !== null && productionText !== snapshotText) {
      return "conflict";
    }
    return "lost";
  }
  if (productionText === null && snapshotText !== null) return "restore";
  if (productionText !== null && snapshotText !== null) {
    return productionText === snapshotText ? "intact" : "conflict";
  }
  if (productionText !== null && snapshotText === null) return "newerWork";
  return "lost";
}

/**
 * Assembles `DiagnosisReport.blastRadius` (FR-004) from `gateway.ts`'s
 * `fetchLessonsSharingMasterIds` result: the count of master IDs also
 * referenced by lessons other than the one under diagnosis, plus the
 * deduplicated list of those other lessons.
 */
export function assembleBlastRadius(
  affectedLesson: LessonRef,
  masterIdLessons: MasterIdLessons[]
): { sharedMasterIds: number; lessons: LessonRef[] } {
  const isAffectedLesson = (ref: LessonRef): boolean =>
    ref.book === affectedLesson.book &&
    ref.series === affectedLesson.series &&
    ref.lesson === affectedLesson.lesson;

  let sharedMasterIds = 0;
  const seenLessonKeys = new Set<string>();
  const lessons: LessonRef[] = [];

  for (const entry of masterIdLessons) {
    const otherLessons = entry.lessons.filter((ref) => !isAffectedLesson(ref));
    if (otherLessons.length === 0) continue;
    sharedMasterIds += 1;
    for (const ref of otherLessons) {
      const key = `${ref.book}:${ref.series}:${ref.lesson}`;
      if (!seenLessonKeys.has(key)) {
        seenLessonKeys.add(key);
        lessons.push(ref);
      }
    }
  }

  return { sharedMasterIds, lessons };
}
