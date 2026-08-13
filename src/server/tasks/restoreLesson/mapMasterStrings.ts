/**
 * mapMasterStrings.ts — FR-003 pre-incident master-string mapping for the
 * `restoreLesson` task (spec 018-lesson1-translation-restore).
 *
 * Given the affected lesson's `mappingStrategy` (selected by `detectLesson.ts`
 * from the measured `bumpCount`, research D3), maps every one of the
 * snapshot's pre-incident master strings to its production counterpart:
 *
 * - `findTSubsBridge` (bumpCount === 1): the pre-incident generation is
 *   production's own archived `oldlessonstrings` at `productionVersion - 1`.
 *   Because the Snapshot is a backup of production taken before the incident,
 *   a snapshot masterId that appears unchanged in current production
 *   lessonstrings maps to itself; a masterId retired by the bad re-upload is
 *   bridged via `diffLessonStrings` (the same `diff`-based mechanism
 *   `findTSubs.ts`'s `diffLesson` uses), which pairs old→new masterIds
 *   one-for-one only when a substitution run has equal length on both sides.
 * - `snapshotAnchored` (bumpCount > 1, or as a fallback for anything the
 *   bridge above cannot resolve): the snapshot and production databases are
 *   different masterId identity spaces, so no id-equality shortcut applies.
 *   Matching is by English text equality, then `(type, xpath)`, then ordinal
 *   position — every candidate restricted to master strings the *affected
 *   lesson's own current production lessonstrings* actually reference (I8),
 *   consumed in order so two snapshot strings never collapse onto one
 *   production masterId.
 *
 * Pure function — no I/O — per research D11's pure-diagnosis-core design;
 * the caller fetches `productionOldLessonStrings` / the `tstrings` rows via
 * `gateway.ts`.
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Deferred Questions
 * resolution table (bumpCount strategy), research D3,
 * specs/018-lesson1-translation-restore/data-model.md MasterStringMapping type.
 */
import { diffLessonStrings } from "../../actions/findTSubs";
import { LessonString } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { AffectedLesson, MasterStringMapping } from "./types";

export interface MapMasterStringsInput {
  affectedLesson: AffectedLesson;
  /** the Snapshot's own lessonstrings for the affected lesson — the pre-incident truth, in order */
  snapshotLessonStrings: LessonString[];
  /** production's *current* lessonstrings for the affected lesson */
  productionLessonStrings: LessonString[];
  /** production's archived pre-incident generation (`oldlessonstrings` at `productionVersion - 1`); only consulted for `findTSubsBridge` */
  productionOldLessonStrings: LessonString[];
  /** Snapshot `tstrings` rows where `languageId === ENGLISH_ID` */
  snapshotEnglishTStrings: TString[];
  /** production `tstrings` rows where `languageId === ENGLISH_ID` */
  productionEnglishTStrings: TString[];
}

/**
 * Maps every snapshot master string of the affected lesson to its production
 * counterpart, recording how each was matched. Never emits an entry for a
 * masterId outside the affected lesson (I8).
 */
export function mapMasterStrings(input: MapMasterStringsInput): MasterStringMapping[] {
  const { affectedLesson, snapshotLessonStrings, productionLessonStrings } = input;

  const productionMasterIds = new Set(productionLessonStrings.map((ls) => ls.masterId));
  const snapshotEnglishByMasterId = new Map(
    input.snapshotEnglishTStrings.map((t) => [t.masterId, t])
  );
  // I8: restrict English-text candidates to master strings the affected
  // lesson's own current production lessonstrings actually reference.
  const productionEnglishByMasterId = new Map(
    input.productionEnglishTStrings
      .filter((t) => productionMasterIds.has(t.masterId))
      .map((t) => [t.masterId, t] as const)
  );

  const bridgeMap = new Map<number, number>();
  if (affectedLesson.mappingStrategy === "findTSubsBridge") {
    const idSubs = diffLessonStrings(productionLessonStrings, input.productionOldLessonStrings);
    for (const sub of idSubs) {
      const fromIds = sub.from.split(",").map(Number);
      const toIds = sub.to.split(",").map(Number);
      // Only a length-equal substitution run is a sound one-for-one bridge;
      // anything else falls through to the text/typeXpath/position fallbacks.
      if (fromIds.length === toIds.length) {
        fromIds.forEach((fromId, i) => bridgeMap.set(fromId, toIds[i]));
      }
    }
  }

  const consumedProductionMasterIds = new Set<number>();

  return snapshotLessonStrings.map((snapshotLessonString, position) => {
    const snapshotMasterId = snapshotLessonString.masterId;
    const englishText = snapshotEnglishByMasterId.get(snapshotMasterId)?.text ?? "";

    let productionMasterId: number | null = null;
    let matchMethod: MasterStringMapping["matchMethod"] = "unmatched";

    if (affectedLesson.mappingStrategy === "findTSubsBridge") {
      if (
        productionMasterIds.has(snapshotMasterId) &&
        !consumedProductionMasterIds.has(snapshotMasterId)
      ) {
        // The Snapshot is a backup of production, so an unchanged masterId
        // denotes the same row on both sides — the strongest possible match.
        productionMasterId = snapshotMasterId;
        matchMethod = "identicalText";
      } else {
        const bridged = bridgeMap.get(snapshotMasterId);
        if (
          bridged !== undefined &&
          productionMasterIds.has(bridged) &&
          !consumedProductionMasterIds.has(bridged)
        ) {
          productionMasterId = bridged;
          matchMethod = "findTSubs";
        }
      }
    }

    if (productionMasterId === null) {
      const englishMatch = findByEnglishText(
        englishText,
        productionEnglishByMasterId,
        consumedProductionMasterIds
      );
      if (englishMatch !== null) {
        productionMasterId = englishMatch;
        matchMethod = "identicalText";
      }
    }

    if (productionMasterId === null) {
      const typeXpathMatch = findByTypeXpath(
        snapshotLessonString,
        productionLessonStrings,
        consumedProductionMasterIds
      );
      if (typeXpathMatch !== null) {
        productionMasterId = typeXpathMatch;
        matchMethod = "typeXpath";
      }
    }

    if (productionMasterId === null) {
      const positional = productionLessonStrings[position];
      if (positional && !consumedProductionMasterIds.has(positional.masterId)) {
        productionMasterId = positional.masterId;
        matchMethod = "position";
      }
    }

    if (productionMasterId !== null) {
      consumedProductionMasterIds.add(productionMasterId);
    }

    return {
      snapshotMasterId,
      productionMasterId,
      englishText,
      type: snapshotLessonString.type,
      xpath: snapshotLessonString.xpath,
      position,
      matchMethod,
      reachableInProduction: productionMasterId !== null,
      sharedWithLessons: [],
    };
  });
}

function findByEnglishText(
  englishText: string,
  productionEnglishByMasterId: Map<number, TString>,
  consumedProductionMasterIds: Set<number>
): number | null {
  for (const [masterId, tString] of productionEnglishByMasterId) {
    if (consumedProductionMasterIds.has(masterId)) continue;
    if (tString.text === englishText) return masterId;
  }
  return null;
}

function findByTypeXpath(
  snapshotLessonString: LessonString,
  productionLessonStrings: LessonString[],
  consumedProductionMasterIds: Set<number>
): number | null {
  for (const productionLessonString of productionLessonStrings) {
    if (consumedProductionMasterIds.has(productionLessonString.masterId)) continue;
    if (
      productionLessonString.type === snapshotLessonString.type &&
      productionLessonString.xpath === snapshotLessonString.xpath
    ) {
      return productionLessonString.masterId;
    }
  }
  return null;
}
