import fs from "fs";
import path from "path";
import type { DiagnosisReport } from "./types";

/**
 * No JSON-schema validator library (e.g. ajv) is declared in package.json, so
 * this test walks specs/018-lesson1-translation-restore/contracts/report.schema.json
 * directly with a small structural validator covering the subset of JSON
 * Schema (draft-07) keywords the report schema actually uses:
 * type/enum/const/pattern/format/minLength/minItems/minimum/properties/
 * required/additionalProperties/items/$ref (local #/definitions/*).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonSchema = Record<string, any>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  // Only local refs of the shape "#/definitions/<name>" appear in this schema.
  const match = /^#\/definitions\/(.+)$/.exec(ref);
  if (!match) {
    throw new Error(`Unsupported $ref: ${ref}`);
  }
  const definition = root.definitions?.[match[1]];
  if (!definition) {
    throw new Error(`Unresolvable $ref: ${ref}`);
  }
  return definition as JsonSchema;
}

function validate(root: JsonSchema, schema: JsonSchema, value: unknown, at: string): string[] {
  const errors: string[] = [];

  if (schema.$ref) {
    return validate(root, resolveRef(root, schema.$ref), value, at);
  }

  if ("const" in schema) {
    if (value !== schema.const) {
      errors.push(
        `${at}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`
      );
    }
    return errors;
  }

  if (schema.enum) {
    if (!schema.enum.includes(value)) {
      errors.push(
        `${at}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`
      );
    }
    return errors;
  }

  const types: string[] = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (types.length > 0) {
    const actual = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const jsType = actual === "number" && Number.isInteger(value) ? "integer" : actual;
    const matches = types.some(
      (t) =>
        t === actual ||
        (t === "integer" && jsType === "integer") ||
        (t === "number" && actual === "number")
    );
    if (!matches) {
      errors.push(`${at}: expected type ${JSON.stringify(schema.type)}, got ${actual}`);
      return errors;
    }
  }

  if (value === null || value === undefined) {
    return errors;
  }

  if (
    typeof schema.minLength === "number" &&
    typeof value === "string" &&
    value.length < schema.minLength
  ) {
    errors.push(`${at}: string shorter than minLength ${schema.minLength}`);
  }

  if (typeof schema.pattern === "string" && typeof value === "string") {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push(`${at}: does not match pattern ${schema.pattern}`);
    }
  }

  if (schema.format === "date-time" && typeof value === "string") {
    if (Number.isNaN(Date.parse(value))) {
      errors.push(`${at}: not a valid date-time`);
    }
  }

  if (typeof schema.minimum === "number" && typeof value === "number" && value < schema.minimum) {
    errors.push(`${at}: below minimum ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${at}: array shorter than minItems ${schema.minItems}`);
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push(`${at}: array longer than maxItems ${schema.maxItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) => {
        errors.push(...validate(root, schema.items, item, `${at}[${i}]`));
      });
    }
  }

  if (isPlainObject(value) && schema.type === "object") {
    const required: string[] = schema.required ?? [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${at}: missing required property "${key}"`);
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          errors.push(`${at}: unexpected additional property "${key}"`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          errors.push(...validate(root, propSchema as JsonSchema, value[key], `${at}.${key}`));
        }
      }
    }
  }

  return errors;
}

describe("DiagnosisReport", () => {
  const schemaPath = path.join(
    __dirname,
    "../../../../specs/018-lesson1-translation-restore/contracts/report.schema.json"
  );
  const schema: JsonSchema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));

  it("accepts a hand-built sample satisfying both the TS type and report.schema.json", () => {
    const sample: DiagnosisReport = {
      diagnosisId: "d3f4b8b0-1234-4abc-9def-0123456789ab",
      diagnosisChecksum: "a".repeat(64),
      reportChecksum: "b".repeat(64),
      generatedAt: "2026-08-01T00:00:00.000Z",
      toolVersion: "1.0.0",
      mode: "diagnose",
      identity: {
        productionMarkerPresent: true,
        snapshotConfirmationToken: "operator-confirmed",
        productionLessonVersion: 158,
        snapshotLessonVersion: 156,
        snapshotIsOlder: true,
      },
      productionFingerprint: {
        databaseName: "lessons-from-luke",
        lessonCount: 42,
        maxMasterId: 9001,
        maxLessonStringId: 20001,
      },
      affectedLessons: [
        {
          book: "Luke",
          series: 1,
          lesson: 1,
          productionLessonId: 1,
          snapshotLessonId: 1,
          productionVersion: 158,
          snapshotVersion: 156,
          bumpCount: 2,
          expectedBumpCount: 1,
          mappingStrategy: "snapshotAnchored",
          knownBadVersions: [158],
          candidateMasterDocuments: [
            {
              filepath: "docs/Luke-1-01v157.odt",
              version: 157,
              englishTextSetMatchesSnapshot: true,
              isKnownBadUpload: false,
              missingFromDocument: [],
              extraInDocument: [],
              sha256: "c".repeat(64),
              sizeBytes: 12345,
            },
          ],
        },
      ],
      languageIdentityChecks: [
        {
          matchedBy: "code",
          key: "fr",
          snapshotLanguageId: 7,
          productionLanguageId: 7,
          snapshotCode: "fr",
          productionCode: "fr",
          snapshotName: "French",
          productionName: "French",
          agrees: true,
        },
      ],
      mappings: [
        {
          snapshotMasterId: 100,
          productionMasterId: 100,
          englishText: "In the beginning",
          type: "content",
          xpath: "/body/p[1]",
          position: 0,
          matchMethod: "identicalText",
          reachableInProduction: true,
          sharedWithLessons: [{ book: "Luke", series: 1, lesson: 2 }],
        },
      ],
      findings: [
        {
          languageId: 7,
          languageName: "French",
          languageArchived: false,
          snapshotMasterId: 100,
          productionMasterId: 100,
          classification: "restore",
          snapshotText: "Au commencement",
          productionText: null,
          productionModified: null,
          legacyLessonStringId: null,
          sampleEnglishText: "In the beginning",
        },
      ],
      perLanguageCounts: [
        {
          languageId: 7,
          languageName: "French",
          archived: false,
          snapshotReachable: 1,
          productionReachableBefore: 0,
          productionReachableAfter: null,
          restored: 0,
          conflicts: 0,
          newerWork: 0,
          lost: 0,
          driftSkipped: 0,
        },
      ],
      legacyLessonStringRowCounts: { production: 0, snapshot: 0 },
      blastRadius: { sharedMasterIds: 1, lessons: [{ book: "Luke", series: 1, lesson: 2 }] },
      plannedWrites: [
        {
          languageId: 7,
          masterId: 100,
          lessonStringId: null,
          text: "Au commencement",
          history: [],
          sourceLanguageId: null,
          source: null,
        },
      ],
      duplicateRowsBaseline: [],
      conflicts: [],
    };

    const errors = validate(schema, schema, sample, "$");

    expect(errors).toEqual([]);
  });
});
