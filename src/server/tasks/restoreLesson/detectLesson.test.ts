/// <reference types="jest" />

/**
 * Unit tests for detectLesson.ts (FR-002 affected-lesson detection +
 * bumpCount + mapping-strategy selection).
 *
 * Spec: specs/018-lesson1-translation-restore/spec.md FR-002,
 * specs/018-lesson1-translation-restore/plan.md §Known incident version
 * facts table, §Drift severity section (expected bumpCount rule), research
 * D3.
 */
import { BaseLesson } from "../../../core/models/Lesson";
import { RestoreLessonAbortError } from "./identity";
import { detectAffectedLesson } from "./detectLesson";

function lesson(overrides: Partial<BaseLesson>): BaseLesson {
  return {
    lessonId: 1,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 157,
    ...overrides,
  };
}

describe("detectAffectedLesson", () => {
  test("joins (book, series, lesson) across both databases, not lessonId", () => {
    const productionLesson = lesson({ lessonId: 501, version: 158 });
    const snapshotLesson = lesson({ lessonId: 42, version: 157 });

    const { affectedLesson } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson,
      snapshotLesson,
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments: [],
    });

    expect(affectedLesson.book).toBe("Luke");
    expect(affectedLesson.series).toBe(1);
    expect(affectedLesson.lesson).toBe(1);
    expect(affectedLesson.productionLessonId).toBe(501);
    expect(affectedLesson.snapshotLessonId).toBe(42);
    expect(affectedLesson.productionVersion).toBe(158);
    expect(affectedLesson.snapshotVersion).toBe(157);
  });

  test("computes bumpCount as productionVersion - snapshotVersion", () => {
    const { affectedLesson } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 158 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments: [],
    });

    expect(affectedLesson.bumpCount).toBe(1);
  });

  test("selects findTSubsBridge when bumpCount === 1", () => {
    const { affectedLesson } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 158 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments: [],
    });

    expect(affectedLesson.mappingStrategy).toBe("findTSubsBridge");
  });

  test("selects snapshotAnchored when bumpCount !== 1", () => {
    const { affectedLesson } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 159 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 2,
      candidateMasterDocuments: [],
    });

    expect(affectedLesson.bumpCount).toBe(2);
    expect(affectedLesson.mappingStrategy).toBe("snapshotAnchored");
  });

  test("aborts (13) when no production lesson is found for the (book, series, lesson) identity", () => {
    expect(() =>
      detectAffectedLesson({
        book: "Luke",
        series: 1,
        lesson: 1,
        productionLesson: null,
        snapshotLesson: lesson({ version: 157 }),
        knownBadVersions: [158],
        expectedBumpCount: 1,
        candidateMasterDocuments: [],
      })
    ).toThrow(RestoreLessonAbortError);

    try {
      detectAffectedLesson({
        book: "Luke",
        series: 1,
        lesson: 1,
        productionLesson: null,
        snapshotLesson: lesson({ version: 157 }),
        knownBadVersions: [158],
        expectedBumpCount: 1,
        candidateMasterDocuments: [],
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(13);
    }
  });

  test("aborts (13) when no snapshot lesson is found for the (book, series, lesson) identity", () => {
    expect(() =>
      detectAffectedLesson({
        book: "Luke",
        series: 1,
        lesson: 1,
        productionLesson: lesson({ version: 158 }),
        snapshotLesson: null,
        knownBadVersions: [158],
        expectedBumpCount: 1,
        candidateMasterDocuments: [],
      })
    ).toThrow(RestoreLessonAbortError);
  });

  test("no bumpCount warning when the measured bumpCount matches expectedBumpCount", () => {
    const { bumpCountWarning } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 158 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments: [],
    });

    expect(bumpCountWarning).toBeNull();
  });

  test("fires a bumpCount warning on an unexpected mismatch, without aborting", () => {
    const { affectedLesson, bumpCountWarning } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 160 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments: [],
    });

    expect(affectedLesson.bumpCount).toBe(3);
    expect(bumpCountWarning).not.toBeNull();
    expect(bumpCountWarning).toMatch(/3/);
  });

  test("does NOT warn on the legitimate post-restore bumpCount=2 case (expectedBumpCount carried forward as 2)", () => {
    const { bumpCountWarning } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 159 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 2,
      candidateMasterDocuments: [],
    });

    expect(bumpCountWarning).toBeNull();
  });

  test("reports the re-upload count (bumpCount) on the returned AffectedLesson", () => {
    const { affectedLesson } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 161 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments: [],
    });

    expect(affectedLesson.bumpCount).toBe(4);
  });

  test("carries knownBadVersions, expectedBumpCount, and candidateMasterDocuments through to the AffectedLesson", () => {
    const candidateMasterDocuments = [
      {
        filepath: "docs/Luke-1-01v157.odt",
        version: 157,
        sha256: "deadbeef",
        sizeBytes: 1234,
        englishTextSetMatchesSnapshot: true,
        isKnownBadUpload: false,
        missingFromDocument: [],
        extraInDocument: [],
      },
    ];

    const { affectedLesson } = detectAffectedLesson({
      book: "Luke",
      series: 1,
      lesson: 1,
      productionLesson: lesson({ version: 158 }),
      snapshotLesson: lesson({ version: 157 }),
      knownBadVersions: [158],
      expectedBumpCount: 1,
      candidateMasterDocuments,
    });

    expect(affectedLesson.knownBadVersions).toEqual([158]);
    expect(affectedLesson.expectedBumpCount).toBe(1);
    expect(affectedLesson.candidateMasterDocuments).toBe(candidateMasterDocuments);
  });
});
