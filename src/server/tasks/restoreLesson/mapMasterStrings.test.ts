/// <reference types="jest" />

/**
 * Unit tests for mapMasterStrings.ts (FR-003 master-string mapping,
 * `findTSubsBridge` and `snapshotAnchored` strategies).
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Deferred Questions
 * resolution table (bumpCount strategy), research D3,
 * specs/018-lesson1-translation-restore/data-model.md MasterStringMapping type.
 */
import { ENGLISH_ID } from "../../../core/models/Language";
import { LessonString, LessonStringType } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { mapMasterStrings } from "./mapMasterStrings";
import { AffectedLesson, MappingStrategy } from "./types";

function affectedLesson(
  mappingStrategy: MappingStrategy,
  overrides: Partial<AffectedLesson> = {}
): AffectedLesson {
  return {
    book: "Luke",
    series: 1,
    lesson: 1,
    productionLessonId: 501,
    snapshotLessonId: 42,
    productionVersion: 158,
    snapshotVersion: 157,
    bumpCount: mappingStrategy === "findTSubsBridge" ? 1 : 2,
    mappingStrategy,
    knownBadVersions: [158],
    expectedBumpCount: 1,
    candidateMasterDocuments: [],
    ...overrides,
  };
}

function lstr(
  masterId: number,
  overrides: Partial<LessonString & { type: LessonStringType }> = {}
): LessonString {
  return {
    lessonStringId: masterId * 10,
    masterId,
    lessonId: 501,
    lessonVersion: 158,
    type: "content",
    xpath: `/body/p[${masterId}]`,
    motherTongue: false,
    ...overrides,
  };
}

function eng(masterId: number, text: string): TString {
  return { masterId, languageId: ENGLISH_ID, text, history: [] };
}

describe("mapMasterStrings — findTSubsBridge (bumpCount === 1)", () => {
  test("a masterId retained unchanged in production maps to itself", () => {
    const snapshotLessonStrings = [lstr(100, { type: "content", xpath: "/p[1]" })];
    const productionLessonStrings = [lstr(100, { type: "content", xpath: "/p[1]" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("findTSubsBridge"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [lstr(100, { type: "content", xpath: "/p[1]" })],
      snapshotEnglishTStrings: [eng(100, "In the beginning")],
      productionEnglishTStrings: [eng(100, "In the beginning")],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      snapshotMasterId: 100,
      productionMasterId: 100,
      matchMethod: "identicalText",
      reachableInProduction: true,
    });
  });

  test("a masterId bumped by the re-upload maps via the findTSubs bridge", () => {
    const snapshotLessonStrings = [lstr(100, { xpath: "/p[1]" })];
    // production's pre-incident generation (archived to oldlessonstrings) had masterId 100
    // at this xpath; the re-upload replaced it with masterId 200 at the same xpath.
    const productionOldLessonStrings = [lstr(100, { xpath: "/p[1]" })];
    const productionLessonStrings = [lstr(200, { xpath: "/p[1]" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("findTSubsBridge"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings,
      snapshotEnglishTStrings: [eng(100, "In the beginning")],
      productionEnglishTStrings: [eng(200, "In the beginning was the Word")],
    });

    expect(result[0]).toMatchObject({
      snapshotMasterId: 100,
      productionMasterId: 200,
      matchMethod: "findTSubs",
      reachableInProduction: true,
    });
  });

  test("an unequal from/to substitution falls through to the fallback chain instead of bridging", () => {
    // diffLessonStrings pairs a 1-string removal with a 2-string addition; the bridge
    // refuses to positionally zip mismatched lengths and falls through.
    const snapshotLessonStrings = [lstr(100, { xpath: "/p[1]" })];
    const productionOldLessonStrings = [lstr(100, { xpath: "/p[1]" })];
    const productionLessonStrings = [lstr(200, { xpath: "/p[1]" }), lstr(201, { xpath: "/p[2]" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("findTSubsBridge"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings,
      snapshotEnglishTStrings: [eng(100, "Unique snapshot text")],
      productionEnglishTStrings: [eng(200, "Different"), eng(201, "Also different")],
    });

    expect(result[0].matchMethod).not.toBe("findTSubs");
  });
});

describe("mapMasterStrings — snapshotAnchored (bumpCount > 1)", () => {
  test("matches snapshot to production by identical English text", () => {
    const snapshotLessonStrings = [lstr(100, { xpath: "/p[1]" })];
    const productionLessonStrings = [lstr(900, { xpath: "/p[9]" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "In the beginning")],
      productionEnglishTStrings: [eng(900, "In the beginning")],
    });

    expect(result[0]).toMatchObject({
      snapshotMasterId: 100,
      productionMasterId: 900,
      matchMethod: "identicalText",
      reachableInProduction: true,
    });
  });

  test("I8: an identical English text outside the affected lesson's production lessonstrings never matches", () => {
    const snapshotLessonStrings = [lstr(100, { xpath: "/p[1]" })];
    // masterId 999 has identical English text but is NOT referenced by this lesson's
    // current lessonstrings (it belongs to some other lesson) — must be ignored.
    const productionLessonStrings = [lstr(900, { xpath: "/p[9]" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "In the beginning")],
      productionEnglishTStrings: [
        eng(999, "In the beginning"),
        eng(900, "Something else entirely"),
      ],
    });

    expect(result[0].productionMasterId).not.toBe(999);
  });

  test("duplicate English texts are consumed in order, not mapped to the same production masterId twice", () => {
    const snapshotLessonStrings = [lstr(100, { xpath: "/p[1]" }), lstr(101, { xpath: "/p[2]" })];
    const productionLessonStrings = [lstr(900, { xpath: "/p[9]" }), lstr(901, { xpath: "/p[10]" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "Repeated"), eng(101, "Repeated")],
      productionEnglishTStrings: [eng(900, "Repeated"), eng(901, "Repeated")],
    });

    expect(result[0].productionMasterId).toBe(900);
    expect(result[1].productionMasterId).toBe(901);
  });

  test("falls back to (type, xpath) when no English text matches", () => {
    const snapshotLessonStrings = [lstr(100, { type: "styles", xpath: "/p[1]/style" })];
    const productionLessonStrings = [lstr(900, { type: "styles", xpath: "/p[1]/style" })];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "Snapshot-only text")],
      productionEnglishTStrings: [eng(900, "Production-only text")],
    });

    expect(result[0]).toMatchObject({
      productionMasterId: 900,
      matchMethod: "typeXpath",
      reachableInProduction: true,
    });
  });

  test("falls back to ordinal position when neither text nor (type, xpath) match", () => {
    const snapshotLessonStrings = [
      lstr(100, { type: "content", xpath: "/p[1]" }),
      lstr(101, { type: "content", xpath: "/p[2]" }),
    ];
    const productionLessonStrings = [
      lstr(900, { type: "meta", xpath: "/head/title" }),
      lstr(901, { type: "meta", xpath: "/head/subtitle" }),
    ];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "First"), eng(101, "Second")],
      productionEnglishTStrings: [eng(900, "Uno"), eng(901, "Dos")],
    });

    expect(result[0]).toMatchObject({ productionMasterId: 900, matchMethod: "position" });
    expect(result[1]).toMatchObject({ productionMasterId: 901, matchMethod: "position" });
  });

  test("reports unmatched with a null productionMasterId when nothing lines up", () => {
    const snapshotLessonStrings = [lstr(100, { type: "content", xpath: "/p[1]" })];
    const productionLessonStrings: LessonString[] = [];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings,
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "Orphaned forever")],
      productionEnglishTStrings: [],
    });

    expect(result[0]).toMatchObject({
      productionMasterId: null,
      matchMethod: "unmatched",
      reachableInProduction: false,
    });
  });

  test("output preserves snapshot order and sets position to the ordinal index", () => {
    const snapshotLessonStrings = [
      lstr(100, { xpath: "/p[1]" }),
      lstr(101, { xpath: "/p[2]" }),
      lstr(102, { xpath: "/p[3]" }),
    ];

    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings,
      productionLessonStrings: [],
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "a"), eng(101, "b"), eng(102, "c")],
      productionEnglishTStrings: [],
    });

    expect(result.map((m) => m.snapshotMasterId)).toEqual([100, 101, 102]);
    expect(result.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  test("sharedWithLessons is left empty; blast radius is populated by a later step", () => {
    const result = mapMasterStrings({
      affectedLesson: affectedLesson("snapshotAnchored"),
      snapshotLessonStrings: [lstr(100)],
      productionLessonStrings: [lstr(900)],
      productionOldLessonStrings: [],
      snapshotEnglishTStrings: [eng(100, "x")],
      productionEnglishTStrings: [eng(900, "x")],
    });

    expect(result[0].sharedWithLessons).toEqual([]);
  });
});
