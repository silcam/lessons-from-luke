/// <reference types="jest" />

/**
 * Unit tests for identity.ts (I22 cross-database language identity + FR-001
 * server identification). Fixtures only — no real DB, no mocked fs; the
 * marker-file check exercises a real temp directory.
 *
 * Spec: specs/018-lesson1-translation-restore/contracts/cli.md diagnose
 * preconditions 1-3, specs/018-lesson1-translation-restore/plan.md
 * §Cross-database language identity (I22),
 * specs/018-lesson1-translation-restore/data-model.md ServerIdentity /
 * LanguageIdentityCheck.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { Language } from "../../../core/models/Language";
import {
  PRODUCTION_MARKER_FILENAME,
  RestoreLessonAbortError,
  verifyServerIdentity,
  checkLanguageIdentity,
} from "./identity";

function lang(overrides: Partial<Language>): Language {
  return {
    languageId: 1,
    name: "English",
    code: "en",
    motherTongue: false,
    progress: [],
    defaultSrcLang: 1,
    archived: false,
    ...overrides,
  };
}

function tmpHomeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "identity-test-"));
}

describe("verifyServerIdentity", () => {
  test("aborts (10) when the production marker file is missing", () => {
    const homeDir = tmpHomeDir();

    expect(() =>
      verifyServerIdentity({
        homeDir,
        snapshotConfirmationToken: "confirmed-by-operator",
        productionLessonVersion: 159,
        snapshotLessonVersion: 157,
      })
    ).toThrow(RestoreLessonAbortError);

    try {
      verifyServerIdentity({
        homeDir,
        snapshotConfirmationToken: "confirmed-by-operator",
        productionLessonVersion: 159,
        snapshotLessonVersion: 157,
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(10);
    }
  });

  test("returns a ServerIdentity when the marker is present and the snapshot is older", () => {
    const homeDir = tmpHomeDir();
    fs.writeFileSync(path.join(homeDir, PRODUCTION_MARKER_FILENAME), "");

    const identity = verifyServerIdentity({
      homeDir,
      snapshotConfirmationToken: "confirmed-by-operator",
      productionLessonVersion: 159,
      snapshotLessonVersion: 157,
    });

    expect(identity).toEqual({
      productionMarkerPresent: true,
      snapshotConfirmationToken: "confirmed-by-operator",
      productionLessonVersion: 159,
      snapshotLessonVersion: 157,
      snapshotIsOlder: true,
    });
  });

  test("aborts (11) when the snapshot is not older than production", () => {
    const homeDir = tmpHomeDir();
    fs.writeFileSync(path.join(homeDir, PRODUCTION_MARKER_FILENAME), "");

    try {
      verifyServerIdentity({
        homeDir,
        snapshotConfirmationToken: "confirmed-by-operator",
        productionLessonVersion: 157,
        snapshotLessonVersion: 157,
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(11);
    }
  });
});

describe("checkLanguageIdentity", () => {
  test("joins on code when it is non-null and unique on both databases", () => {
    const snapshotLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 2, name: "Français", code: "fr" }),
    ];
    const productionLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 2, name: "Français", code: "fr" }),
    ];

    const checks = checkLanguageIdentity({
      snapshotLanguages,
      productionLanguages,
      snapshotLanguageIdsWithAffectedLessonTranslations: [],
    });

    expect(checks).toHaveLength(2);
    expect(checks.every((c) => c.matchedBy === "code")).toBe(true);
    expect(checks.every((c) => c.agrees)).toBe(true);
    const english = checks.find((c) => c.key === "en");
    expect(english).toMatchObject({
      snapshotLanguageId: 1,
      productionLanguageId: 1,
    });
  });

  test("falls back to name when code is unusable as a join key", () => {
    const snapshotLanguages = [
      lang({ languageId: 1, name: "English", code: null as unknown as string }),
      lang({ languageId: 2, name: "Français", code: "fr" }),
    ];
    const productionLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 2, name: "Français", code: "fr" }),
    ];

    const checks = checkLanguageIdentity({
      snapshotLanguages,
      productionLanguages,
      snapshotLanguageIdsWithAffectedLessonTranslations: [],
    });

    expect(checks.every((c) => c.matchedBy === "name")).toBe(true);
    const english = checks.find((c) => c.key === "English");
    expect(english).toMatchObject({ snapshotLanguageId: 1, productionLanguageId: 1, agrees: true });
  });

  test("aborts (15) naming the offending languages when neither code nor name qualifies", () => {
    // code has a null on the snapshot side; name has a duplicate on the
    // production side. Neither key can be trusted.
    const snapshotLanguages = [
      lang({ languageId: 1, name: "English", code: null as unknown as string }),
      lang({ languageId: 2, name: "English", code: "fr" }),
    ];
    const productionLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 2, name: "English", code: "fr" }),
    ];

    try {
      checkLanguageIdentity({
        snapshotLanguages,
        productionLanguages,
        snapshotLanguageIdsWithAffectedLessonTranslations: [],
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(15);
      expect((e as RestoreLessonAbortError).message).toMatch(/English/);
    }
  });

  test("aborts (15) when a matched pair disagrees on languageId", () => {
    const snapshotLanguages = [lang({ languageId: 5, name: "English", code: "en" })];
    const productionLanguages = [lang({ languageId: 9, name: "English", code: "en" })];

    try {
      checkLanguageIdentity({
        snapshotLanguages,
        productionLanguages,
        snapshotLanguageIdsWithAffectedLessonTranslations: [],
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(15);
    }
  });

  test("aborts (15) when two snapshot languages map to one production language", () => {
    const snapshotLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 2, name: "English (dup)", code: "en-dup" }),
    ];
    // Contrived: both snapshot keys resolve to the same production id.
    const productionLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 1, name: "English (dup)", code: "en-dup" }),
    ];

    try {
      checkLanguageIdentity({
        snapshotLanguages,
        productionLanguages,
        snapshotLanguageIdsWithAffectedLessonTranslations: [],
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(15);
    }
  });

  test("aborts (15) when an orphan snapshot language has affected-lesson translations", () => {
    const snapshotLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 3, name: "Batanga", code: "bat" }),
    ];
    const productionLanguages = [lang({ languageId: 1, name: "English", code: "en" })];

    try {
      checkLanguageIdentity({
        snapshotLanguages,
        productionLanguages,
        snapshotLanguageIdsWithAffectedLessonTranslations: [3],
      });
      fail("expected abort");
    } catch (e) {
      expect(e).toBeInstanceOf(RestoreLessonAbortError);
      expect((e as RestoreLessonAbortError).exitCode).toBe(15);
      expect((e as RestoreLessonAbortError).message).toMatch(/Batanga/);
    }
  });

  test("records a production-only language without aborting", () => {
    const snapshotLanguages = [lang({ languageId: 1, name: "English", code: "en" })];
    const productionLanguages = [
      lang({ languageId: 1, name: "English", code: "en" }),
      lang({ languageId: 4, name: "New Language", code: "new" }),
    ];

    const checks = checkLanguageIdentity({
      snapshotLanguages,
      productionLanguages,
      snapshotLanguageIdsWithAffectedLessonTranslations: [],
    });

    const productionOnly = checks.find((c) => c.key === "new");
    expect(productionOnly).toMatchObject({
      snapshotLanguageId: null,
      productionLanguageId: 4,
      agrees: true,
    });
  });

  test("records a renamed language under a code join as evidence, not fatal", () => {
    const snapshotLanguages = [lang({ languageId: 1, name: "Old Name", code: "en" })];
    const productionLanguages = [lang({ languageId: 1, name: "New Name", code: "en" })];

    const checks = checkLanguageIdentity({
      snapshotLanguages,
      productionLanguages,
      snapshotLanguageIdsWithAffectedLessonTranslations: [],
    });

    expect(checks).toEqual([
      {
        matchedBy: "code",
        key: "en",
        snapshotLanguageId: 1,
        productionLanguageId: 1,
        snapshotCode: "en",
        productionCode: "en",
        snapshotName: "Old Name",
        productionName: "New Name",
        agrees: true,
      },
    ]);
  });
});
