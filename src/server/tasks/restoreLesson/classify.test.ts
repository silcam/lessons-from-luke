/// <reference types="jest" />

/**
 * Unit tests for classify.ts (FR-008 conflict classification, research D7,
 * and FR-004 blast radius assembly).
 *
 * Spec: specs/018-lesson1-translation-restore/spec.md FR-008,
 * specs/018-lesson1-translation-restore/plan.md §Client-reported claims,
 * research D7, data-model.md TranslationClassification / TranslationFinding.
 */
import { Language } from "../../../core/models/Language";
import { classifyFindings, assembleBlastRadius, ProductionTStringRow } from "./classify";
import { MasterIdLessons } from "./gateway";
import { MasterStringMapping } from "./types";

const WEBU_LANGUAGE_ID = 42;

function language(overrides: Partial<Language> = {}): Language {
  return {
    languageId: WEBU_LANGUAGE_ID,
    name: "World English Bible Updated",
    code: "webu",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
    archived: false,
    ...overrides,
  };
}

function mapping(overrides: Partial<MasterStringMapping> = {}): MasterStringMapping {
  return {
    snapshotMasterId: 100,
    productionMasterId: 100,
    englishText: "In the beginning",
    type: "content",
    xpath: "/p[1]",
    position: 0,
    matchMethod: "identicalText",
    reachableInProduction: true,
    sharedWithLessons: [],
    ...overrides,
  };
}

function prodRow(
  masterId: number,
  languageId: number,
  overrides: Partial<ProductionTStringRow> = {}
): ProductionTStringRow {
  return {
    masterId,
    languageId,
    text: "production text",
    history: [],
    modified: 1000,
    lessonStringId: null,
    ...overrides,
  };
}

function snapRow(masterId: number, languageId: number, text: string) {
  return { masterId, languageId, text, history: [] };
}

describe("classifyFindings — D7 decision table", () => {
  test("production absent, snapshot present -> restore", () => {
    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      classification: "restore",
      snapshotText: "au commencement",
      productionText: null,
    });
  });

  test("production present, snapshot present, texts equal -> intact", () => {
    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [prodRow(100, WEBU_LANGUAGE_ID, { text: "au commencement" })],
    });

    expect(findings[0].classification).toBe("intact");
  });

  test("production present, snapshot present, texts differ -> conflict", () => {
    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [prodRow(100, WEBU_LANGUAGE_ID, { text: "something else entirely" })],
    });

    expect(findings[0].classification).toBe("conflict");
  });

  test("production present, snapshot absent -> newerWork", () => {
    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [],
      productionTStrings: [prodRow(100, WEBU_LANGUAGE_ID, { text: "brand new translation" })],
    });

    expect(findings[0].classification).toBe("newerWork");
  });

  test("production absent, snapshot absent -> lost", () => {
    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [],
      productionTStrings: [],
    });

    expect(findings[0].classification).toBe("lost");
  });
});

describe("classifyFindings — NULL modified fallback (D7)", () => {
  test("NULL modified on both sides, equal texts -> intact, never skipped or thrown", () => {
    expect(() =>
      classifyFindings({
        mappings: [mapping()],
        languages: [language()],
        snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
        productionTStrings: [
          prodRow(100, WEBU_LANGUAGE_ID, { text: "au commencement", modified: null }),
        ],
      })
    ).not.toThrow();

    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [
        prodRow(100, WEBU_LANGUAGE_ID, { text: "au commencement", modified: null }),
      ],
    });

    expect(findings[0]).toMatchObject({ classification: "intact", productionModified: null });
  });

  test("NULL modified on both sides, differing texts -> conflict, value comparison is primary", () => {
    const findings = classifyFindings({
      mappings: [mapping()],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [
        prodRow(100, WEBU_LANGUAGE_ID, { text: "quite different text", modified: null }),
      ],
    });

    expect(findings[0]).toMatchObject({ classification: "conflict", productionModified: null });
  });
});

describe("classifyFindings — unmatched mapping (no production counterpart)", () => {
  test("unmatched mapping with a snapshot value present classifies as lost, never restore", () => {
    const findings = classifyFindings({
      mappings: [mapping({ productionMasterId: null, matchMethod: "unmatched" })],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [],
    });

    expect(findings[0].classification).toBe("lost");
    expect(findings[0].classification).not.toBe("restore");
    expect(findings[0].productionMasterId).toBeNull();
  });

  // FR-008: "any translation value edited in production after the Snapshot
  // timestamp ... MUST be left untouched and reported for human review" —
  // this holds "regardless of reachability" through the current lesson
  // structure. In the `findTSubsBridge` regime (bumpCount === 1), production
  // and the Snapshot share the same masterId identity space, so a master
  // string's own now-orphaned `tstrings` row (keyed by its `snapshotMasterId`,
  // still fetched via `cli.ts`'s `candidateMasterIds`) can carry real,
  // divergent evidence even when `mapMasterStrings` found no live
  // counterpart to re-attach into. That divergence must surface as
  // `conflict`, never be silently dropped as `lost`.
  test("unmatched mapping whose own orphaned production row diverges from the Snapshot classifies as conflict, not lost", () => {
    const findings = classifyFindings({
      mappings: [mapping({ productionMasterId: null, matchMethod: "unmatched" })],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [
        prodRow(100, WEBU_LANGUAGE_ID, { text: "post-incident production edit" }),
      ],
    });

    expect(findings[0].classification).toBe("conflict");
    expect(findings[0].productionText).toBe("post-incident production edit");
    expect(findings[0].productionMasterId).toBeNull();
  });

  test("unmatched mapping whose own orphaned production row is unchanged from the Snapshot still classifies as lost", () => {
    const findings = classifyFindings({
      mappings: [mapping({ productionMasterId: null, matchMethod: "unmatched" })],
      languages: [language()],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [prodRow(100, WEBU_LANGUAGE_ID, { text: "au commencement" })],
    });

    expect(findings[0].classification).toBe("lost");
  });
});

describe("classifyFindings — client-reported claims verification (plan.md ~109-131)", () => {
  // The client's technical counterpart claims these 3 rows were mistakenly
  // translated against the wrong (v158 cover) English text. They are
  // PREDICTIONS for classify to confirm/refute against the Snapshot, not
  // fixtures baked in as ground truth: this test only asserts the classifier
  // NEVER auto-overwrites them as "restore" when production diverges from
  // the Snapshot's expected English-source text — they must surface as
  // conflict/newerWork for operator review either way.
  const clientReportedRows: Array<{
    masterId: number;
    englishSource: string;
    storedTranslation: string;
  }> = [
    { masterId: 21558, englishSource: "Publisher address", storedTranslation: "Teacher's Guide" },
    { masterId: 21559, englishSource: "City, Region", storedTranslation: "Teacher's Guide" },
    { masterId: 21751, englishSource: "Teacher's Guide", storedTranslation: "Year of publication" },
  ];

  test("a stored production value differing from the Snapshot's value never classifies as restore", () => {
    const mappings = clientReportedRows.map((row) =>
      mapping({
        snapshotMasterId: row.masterId,
        productionMasterId: row.masterId,
        englishText: row.englishSource,
      })
    );
    const snapshotTStrings = clientReportedRows.map((row) =>
      snapRow(row.masterId, WEBU_LANGUAGE_ID, `${row.englishSource} (snapshot translation)`)
    );
    const productionTStrings = clientReportedRows.map((row) =>
      prodRow(row.masterId, WEBU_LANGUAGE_ID, { text: row.storedTranslation, modified: 2_000_000 })
    );

    const findings = classifyFindings({
      mappings,
      languages: [language()],
      snapshotTStrings,
      productionTStrings,
    });

    expect(findings).toHaveLength(3);
    for (const finding of findings) {
      expect(finding.classification).not.toBe("restore");
      expect(["conflict", "newerWork"]).toContain(finding.classification);
    }
  });
});

describe("classifyFindings — field plumbing", () => {
  test("carries languageName, languageArchived, sampleEnglishText, and legacyLessonStringId", () => {
    const findings = classifyFindings({
      mappings: [mapping({ englishText: "In the beginning" })],
      languages: [language({ archived: true, name: "World English Bible Updated" })],
      snapshotTStrings: [snapRow(100, WEBU_LANGUAGE_ID, "au commencement")],
      productionTStrings: [
        prodRow(100, WEBU_LANGUAGE_ID, { text: "au commencement", lessonStringId: 555 }),
      ],
    });

    expect(findings[0]).toMatchObject({
      languageId: WEBU_LANGUAGE_ID,
      languageName: "World English Bible Updated",
      languageArchived: true,
      sampleEnglishText: "In the beginning",
      legacyLessonStringId: 555,
    });
  });
});

describe("assembleBlastRadius — FR-004", () => {
  test("a shared masterId surfaces with the correct other-lesson references, excluding the affected lesson", () => {
    const masterIdLessons: MasterIdLessons[] = [
      {
        masterId: 21751,
        lessons: [
          { book: "Luke", series: 1, lesson: 1 },
          { book: "Luke", series: 2, lesson: 3 },
          { book: "Acts", series: 1, lesson: 1 },
        ],
      },
      {
        masterId: 100,
        lessons: [{ book: "Luke", series: 1, lesson: 1 }],
      },
    ];

    const blastRadius = assembleBlastRadius(
      { book: "Luke", series: 1, lesson: 1 },
      masterIdLessons
    );

    expect(blastRadius.sharedMasterIds).toBe(1);
    expect(blastRadius.lessons).toEqual([
      { book: "Luke", series: 2, lesson: 3 },
      { book: "Acts", series: 1, lesson: 1 },
    ]);
  });

  test("dedupes other-lesson references shared across multiple masterIds", () => {
    const masterIdLessons: MasterIdLessons[] = [
      {
        masterId: 21558,
        lessons: [
          { book: "Luke", series: 1, lesson: 1 },
          { book: "Luke", series: 2, lesson: 3 },
        ],
      },
      {
        masterId: 21559,
        lessons: [
          { book: "Luke", series: 1, lesson: 1 },
          { book: "Luke", series: 2, lesson: 3 },
        ],
      },
    ];

    const blastRadius = assembleBlastRadius(
      { book: "Luke", series: 1, lesson: 1 },
      masterIdLessons
    );

    expect(blastRadius.sharedMasterIds).toBe(2);
    expect(blastRadius.lessons).toEqual([{ book: "Luke", series: 2, lesson: 3 }]);
  });
});
