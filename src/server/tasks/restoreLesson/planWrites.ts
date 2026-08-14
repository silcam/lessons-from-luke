/**
 * planWrites.ts — FR-007 restore write-plan derivation for the
 * `restoreLesson` task (spec 018-lesson1-translation-restore).
 *
 * Turns `classify.ts`'s `TranslationFinding[]` into `RestoreWrite[]`:
 * exactly the `restore`-classified findings, one write per finding, grouped
 * strictly per language (research D6: `saveTStrings` dedupes by `masterId`
 * ignoring `languageId`, so a batch may never mix languages nor repeat a
 * `masterId`).
 *
 * The write plan is derived SOLELY from `mappings` — the affected lesson's
 * own pre-incident master-string mapping (invariant I8). A finding is only
 * ever turned into a write when its `snapshotMasterId` is present in
 * `mappings` and its `productionMasterId` matches that mapping's
 * `productionMasterId`; nothing outside that set can appear in the plan,
 * even though some master strings are shared with other lessons.
 *
 * `--languages` scoping (when the caller passes a restricted set of
 * language ids through) further restricts the plan to just those languages;
 * omitted or `null` scopes the whole corpus.
 *
 * Pure function — no I/O — per research D11's pure-diagnosis-core design.
 *
 * Spec: specs/018-lesson1-translation-restore/spec.md FR-007,
 * specs/018-lesson1-translation-restore/plan.md Complexity Tracking
 * (write plan derived only from mappings — I8),
 * specs/018-lesson1-translation-restore/data-model.md RestoreWrite type.
 */
import { MasterStringMapping, RestoreWrite, TranslationFinding } from "./types";

export interface PlanWritesInput {
  /** the affected lesson's pre-incident master-string mapping (FR-003, I8) */
  mappings: MasterStringMapping[];
  /** classify.ts's output; only 'restore'-classified entries produce writes */
  findings: TranslationFinding[];
  /** --languages, when passed through; null/omitted = whole corpus */
  languageIds?: number[] | null;
}

/**
 * Derives the write plan (FR-007), grouped strictly per language (research
 * D6) and restricted to the affected lesson's mapped master strings (I8).
 */
export function planWrites(input: PlanWritesInput): RestoreWrite[] {
  const mappingBySnapshotMasterId = new Map<number, MasterStringMapping>();
  for (const mapping of input.mappings) {
    mappingBySnapshotMasterId.set(mapping.snapshotMasterId, mapping);
  }

  const languageScope = input.languageIds != null ? new Set(input.languageIds) : null;

  const writesByLanguage = new Map<number, RestoreWrite[]>();

  for (const finding of input.findings) {
    if (finding.classification !== "restore") continue;
    if (languageScope !== null && !languageScope.has(finding.languageId)) continue;

    // I8 guard: the write plan is derived SOLELY from `mappings` — a
    // finding whose snapshotMasterId is not one of the affected lesson's
    // own mapped master strings, or whose productionMasterId disagrees
    // with the mapping, can never become a write.
    const mapping = mappingBySnapshotMasterId.get(finding.snapshotMasterId);
    if (mapping === undefined) continue;
    if (mapping.productionMasterId === null) continue;
    if (mapping.productionMasterId !== finding.productionMasterId) continue;
    // `restore` classification requires a snapshot value (research D7).
    if (finding.snapshotText === null) continue;

    const write: RestoreWrite = {
      languageId: finding.languageId,
      masterId: mapping.productionMasterId,
      lessonStringId: null,
      text: finding.snapshotText,
      history: [],
      sourceLanguageId: null,
      source: null,
    };

    const batch = writesByLanguage.get(write.languageId);
    if (batch) {
      batch.push(write);
    } else {
      writesByLanguage.set(write.languageId, [write]);
    }
  }

  const writes: RestoreWrite[] = [];
  for (const batch of writesByLanguage.values()) {
    writes.push(...batch);
  }
  return writes;
}
