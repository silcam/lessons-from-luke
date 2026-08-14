/// <reference types="jest" />

/**
 * Unit tests for planWrites.ts (FR-007 write-plan derivation, invariant I8,
 * research D6 per-language batching).
 *
 * Spec: specs/018-lesson1-translation-restore/spec.md FR-007,
 * specs/018-lesson1-translation-restore/plan.md Complexity Tracking
 * (write plan derived only from mappings — I8),
 * specs/018-lesson1-translation-restore/data-model.md RestoreWrite type.
 */
import { planWrites } from "./planWrites";
import { MasterStringMapping, TranslationClassification, TranslationFinding } from "./types";

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

function finding(overrides: Partial<TranslationFinding> = {}): TranslationFinding {
  return {
    languageId: 42,
    languageName: "World English Bible Updated",
    languageArchived: false,
    snapshotMasterId: 100,
    productionMasterId: 100,
    classification: "restore",
    snapshotText: "Ni mbut'ubu",
    productionText: null,
    productionModified: null,
    legacyLessonStringId: null,
    sampleEnglishText: "In the beginning",
    ...overrides,
  };
}

describe("planWrites", () => {
  it("emits a write only for 'restore'-classified findings", () => {
    const classifications: TranslationClassification[] = [
      "intact",
      "conflict",
      "newerWork",
      "lost",
    ];
    const findings = classifications.map((classification) =>
      finding({ classification, snapshotMasterId: 100 + classifications.indexOf(classification) })
    );
    const mappings = classifications.map((classification, i) =>
      mapping({ snapshotMasterId: 100 + i, productionMasterId: 100 + i })
    );

    const writes = planWrites({ mappings, findings });

    expect(writes).toEqual([]);
  });

  it("emits a write for a restore-classified finding with the production masterId", () => {
    const writes = planWrites({
      mappings: [mapping()],
      findings: [finding()],
    });

    expect(writes).toEqual([
      {
        languageId: 42,
        masterId: 100,
        lessonStringId: null,
        text: "Ni mbut'ubu",
        history: [],
        sourceLanguageId: null,
        source: null,
      },
    ]);
  });

  it("groups writes strictly one language per batch, never mixing languages", () => {
    const mappings = [
      mapping({ snapshotMasterId: 100, productionMasterId: 100 }),
      mapping({ snapshotMasterId: 200, productionMasterId: 200 }),
    ];
    const findings = [
      finding({ languageId: 1, snapshotMasterId: 100, productionMasterId: 100 }),
      finding({ languageId: 2, snapshotMasterId: 100, productionMasterId: 100 }),
      finding({ languageId: 1, snapshotMasterId: 200, productionMasterId: 200 }),
      finding({ languageId: 2, snapshotMasterId: 200, productionMasterId: 200 }),
    ];

    const writes = planWrites({ mappings, findings });

    // Every write for language 1 must be contiguous, and likewise for
    // language 2 — batches never interleave.
    const languageSequence = writes.map((w) => w.languageId);
    let lastLanguage: number | null = null;
    const seenLanguages = new Set<number>();
    for (const languageId of languageSequence) {
      if (languageId !== lastLanguage) {
        expect(seenLanguages.has(languageId)).toBe(false);
        seenLanguages.add(languageId);
        lastLanguage = languageId;
      }
    }
    expect(writes).toHaveLength(4);
  });

  it("never references a masterId outside the affected lesson's mapping (I8)", () => {
    const mappings = [mapping({ snapshotMasterId: 100, productionMasterId: 100 })];
    // A finding for a master string not present in this lesson's own
    // mapping (e.g. leaked from a different lesson) must never produce a
    // write, even though it classifies as 'restore'.
    const findings = [
      finding({ snapshotMasterId: 100, productionMasterId: 100 }),
      finding({ snapshotMasterId: 999, productionMasterId: 999 }),
    ];

    const writes = planWrites({ mappings, findings });

    expect(writes).toHaveLength(1);
    expect(writes[0].masterId).toBe(100);
  });

  it("never emits a write when the finding's productionMasterId disagrees with the mapping", () => {
    const mappings = [mapping({ snapshotMasterId: 100, productionMasterId: 100 })];
    const findings = [finding({ snapshotMasterId: 100, productionMasterId: 101 })];

    const writes = planWrites({ mappings, findings });

    expect(writes).toEqual([]);
  });

  it("never emits a write for a mapping with no production counterpart", () => {
    const mappings = [mapping({ snapshotMasterId: 100, productionMasterId: null })];
    const findings = [finding({ snapshotMasterId: 100, productionMasterId: null })];

    const writes = planWrites({ mappings, findings });

    expect(writes).toEqual([]);
  });

  it("restricts the plan to the --languages-scoped language ids only", () => {
    const mappings = [mapping({ snapshotMasterId: 100, productionMasterId: 100 })];
    const findings = [
      finding({ languageId: 1, snapshotMasterId: 100, productionMasterId: 100 }),
      finding({ languageId: 2, snapshotMasterId: 100, productionMasterId: 100 }),
    ];

    const writes = planWrites({ mappings, findings, languageIds: [2] });

    expect(writes).toEqual([
      {
        languageId: 2,
        masterId: 100,
        lessonStringId: null,
        text: "Ni mbut'ubu",
        history: [],
        sourceLanguageId: null,
        source: null,
      },
    ]);
  });

  it("does not scope the plan when languageIds is omitted or null", () => {
    const mappings = [mapping({ snapshotMasterId: 100, productionMasterId: 100 })];
    const findings = [
      finding({ languageId: 1, snapshotMasterId: 100, productionMasterId: 100 }),
      finding({ languageId: 2, snapshotMasterId: 100, productionMasterId: 100 }),
    ];

    const writes = planWrites({ mappings, findings, languageIds: null });

    expect(writes).toHaveLength(2);
  });
});
