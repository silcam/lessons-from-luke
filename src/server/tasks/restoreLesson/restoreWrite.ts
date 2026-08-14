/**
 * restoreWrite.ts — FR-009 `saveTStrings` wrapper for the `restoreLesson`
 * task (spec 018-lesson1-translation-restore).
 *
 * `saveTStrings` is the ONLY writer this feature uses (invariant I4) — no
 * bare INSERT anywhere in this task. It has two latent defects, being
 * *compensated for*, not fixed, here (research D6, plan.md Complexity
 * Tracking):
 *
 *   1. It dedupes its input by `masterId` alone, ignoring `languageId` —
 *      so a batch spanning two languages that happen to share a masterId
 *      silently drops one of them. Compensation: group every write by
 *      `languageId` and issue one `saveTStrings` call per language,
 *      never a batch spanning languages.
 *   2. It treats "history is non-empty" as "the row already exists" and
 *      routes such rows to an UPDATE — which silently no-ops when the row
 *      is actually absent. Compensation: always submit `history: []`,
 *      regardless of what the `RestoreWrite` carried, so every write is
 *      correctly routed to INSERT-or-equal-text-no-op. `saveTStrings`
 *      itself appends the prior value to `history` on its own when it
 *      finds an existing row with a different text (I6) — this wrapper
 *      does not hand-roll that.
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Deferred Questions
 * resolution table (saveTStrings wrapped: one language per batch + history:[]
 * on inserts), Complexity Tracking (saveTStrings's two defects),
 * specs/018-lesson1-translation-restore/data-model.md I4/I5/I6.
 */
import { TString } from "../../../core/models/TString";
import { Persistence } from "../../../core/interfaces/Persistence";
import { RestoreWrite } from "./types";

function toTString(write: RestoreWrite): TString {
  return {
    masterId: write.masterId,
    languageId: write.languageId,
    lessonStringId: write.lessonStringId,
    text: write.text,
    // Always [] on submission — defect 2 compensation. Never trust the
    // RestoreWrite's own `history` field here.
    history: [],
    sourceLanguageId: write.sourceLanguageId,
    source: write.source,
  };
}

/**
 * Writes a `RestoreWrite[]` plan through `saveTStrings`, one call per
 * language (defect 1 compensation), each write submitted with
 * `history: []` (defect 2 compensation). Returns exactly what
 * `saveTStrings` reports it actually wrote — `[]` for a fully no-op batch
 * (I5), and history-populated `TString`s for genuine overwrites (I6).
 */
export async function restoreWrite(
  persistence: Pick<Persistence, "saveTStrings">,
  writes: RestoreWrite[]
): Promise<TString[]> {
  const batchesByLanguage = new Map<number, TString[]>();
  for (const write of writes) {
    const tStr = toTString(write);
    const batch = batchesByLanguage.get(write.languageId);
    if (batch) {
      batch.push(tStr);
    } else {
      batchesByLanguage.set(write.languageId, [tStr]);
    }
  }

  const results: TString[] = [];
  for (const batch of batchesByLanguage.values()) {
    const saved = await persistence.saveTStrings(batch);
    results.push(...saved);
  }
  return results;
}
