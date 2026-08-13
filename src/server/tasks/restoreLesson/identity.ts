/**
 * identity.ts — FR-001 server identification and I22 cross-database
 * language identity for the `restoreLesson` task
 * (spec 018-lesson1-translation-restore).
 *
 * Two responsibilities, both preconditions of `diagnose`:
 *
 * 1. `verifyServerIdentity` positively identifies the invoking host as
 *    production via the `THIS_IS_THE_PRODUCTION_SERVER` marker file (10),
 *    and asserts the Snapshot is strictly older than production for the
 *    affected lesson (11).
 * 2. `checkLanguageIdentity` joins `languages` across the two databases
 *    (unfiltered raw SQL fetched by `gateway.ts`'s `fetchAllLanguages`, so
 *    archived languages participate) and asserts, per matched pair, that
 *    `snapshotLanguageId === productionLanguageId` (15).
 *
 * Both functions are pure over their inputs — no I/O beyond a single
 * `fs.existsSync` check in `verifyServerIdentity` — so they are unit
 * testable from fixtures, per research D11 / types.ts's stated intent for a
 * pure diagnosis core.
 *
 * Spec: specs/018-lesson1-translation-restore/contracts/cli.md diagnose
 * preconditions 1-3, specs/018-lesson1-translation-restore/plan.md
 * §Cross-database language identity (I22),
 * specs/018-lesson1-translation-restore/data-model.md ServerIdentity /
 * LanguageIdentityCheck.
 */
import fs from "fs";
import path from "path";
import { Language } from "../../../core/models/Language";
import { LanguageIdentityCheck, ServerIdentity } from "./types";

/** Marker file `verifyServerIdentity` requires in the invoking user's home directory. */
export const PRODUCTION_MARKER_FILENAME = "THIS_IS_THE_PRODUCTION_SERVER";

/**
 * Raised for every `diagnose` precondition failure this module checks.
 * `cli.ts` (task 5.6.7) catches this and maps `exitCode` to `process.exit`.
 */
export class RestoreLessonAbortError extends Error {
  constructor(
    public readonly exitCode: number,
    message: string
  ) {
    super(message);
    this.name = "RestoreLessonAbortError";
  }
}

export interface VerifyServerIdentityInput {
  /** the invoking user's home directory; the marker file is expected directly inside it */
  homeDir: string;
  /** operator's confirmation token proving the snapshot marker file was seen */
  snapshotConfirmationToken: string;
  productionLessonVersion: number;
  snapshotLessonVersion: number;
}

/**
 * Precondition 1 (marker file, exit 10) and precondition 2
 * (`snapshotVersion < productionVersion`, exit 11) of `diagnose`.
 */
export function verifyServerIdentity(input: VerifyServerIdentityInput): ServerIdentity {
  const markerPath = path.join(input.homeDir, PRODUCTION_MARKER_FILENAME);
  const productionMarkerPresent = fs.existsSync(markerPath);
  if (!productionMarkerPresent) {
    throw new RestoreLessonAbortError(
      10,
      `Production marker file missing: ${markerPath}. This tool must be run on the ` +
        `production host, with ${PRODUCTION_MARKER_FILENAME} present in its home directory.`
    );
  }

  const snapshotIsOlder = input.snapshotLessonVersion < input.productionLessonVersion;
  if (!snapshotIsOlder) {
    throw new RestoreLessonAbortError(
      11,
      `Snapshot is not older than production for the affected lesson ` +
        `(snapshot version ${input.snapshotLessonVersion} >= production version ` +
        `${input.productionLessonVersion}). Refusing to proceed with a Snapshot that is not ` +
        `a lineal ancestor of production.`
    );
  }

  return {
    productionMarkerPresent,
    snapshotConfirmationToken: input.snapshotConfirmationToken,
    productionLessonVersion: input.productionLessonVersion,
    snapshotLessonVersion: input.snapshotLessonVersion,
    snapshotIsOlder,
  };
}

export interface CheckLanguageIdentityInput {
  /** every `languages` row on the Snapshot, unfiltered (archived included) */
  snapshotLanguages: Language[];
  /** every `languages` row on production, unfiltered (archived included) */
  productionLanguages: Language[];
  /**
   * Snapshot `languageId`s that have `tStrings` rows for the affected
   * lesson's master strings — the orphan check (a Snapshot-only language
   * with nothing to restore is not fatal; one with translations is).
   */
  snapshotLanguageIdsWithAffectedLessonTranslations: number[];
}

type JoinKey = "code" | "name";

/** `field` is usable as a join key iff it is non-null and unique across all rows. */
function keyQualifies(languages: Language[], field: JoinKey): boolean {
  const values = languages.map((language) => language[field]);
  if (values.some((value) => value === null || value === undefined)) {
    return false;
  }
  return new Set(values).size === values.length;
}

function describeOffenders(languages: Language[], field: JoinKey): string {
  const nulls = languages.filter((l) => l[field] === null || l[field] === undefined);
  const counts = new Map<string, Language[]>();
  for (const language of languages) {
    const value = language[field];
    if (value === null || value === undefined) continue;
    const group = counts.get(value) ?? [];
    group.push(language);
    counts.set(value, group);
  }
  const duplicates = Array.from(counts.values()).filter((group) => group.length > 1);

  const parts: string[] = [];
  if (nulls.length > 0) {
    parts.push(
      `null ${field}: ${nulls.map((l) => `languageId=${l.languageId} (${l.name})`).join(", ")}`
    );
  }
  for (const group of duplicates) {
    parts.push(
      `duplicate ${field} "${group[0][field]}": ${group
        .map((l) => `languageId=${l.languageId} (${l.name})`)
        .join(", ")}`
    );
  }
  return parts.join("; ");
}

/**
 * Precondition 3 (I22, exit 15) of `diagnose`: joins `languages` across the
 * two databases and asserts every matched pair agrees on `languageId`. The
 * join key is chosen at runtime — `code` if it qualifies on both databases,
 * else `name`, else abort naming the offending rows.
 */
export function checkLanguageIdentity(input: CheckLanguageIdentityInput): LanguageIdentityCheck[] {
  const { snapshotLanguages, productionLanguages } = input;

  let matchedBy: JoinKey;
  if (keyQualifies(snapshotLanguages, "code") && keyQualifies(productionLanguages, "code")) {
    matchedBy = "code";
  } else if (keyQualifies(snapshotLanguages, "name") && keyQualifies(productionLanguages, "name")) {
    matchedBy = "name";
  } else {
    const codeOffenders = [
      describeOffenders(snapshotLanguages, "code"),
      describeOffenders(productionLanguages, "code"),
    ]
      .filter(Boolean)
      .join("; ");
    const nameOffenders = [
      describeOffenders(snapshotLanguages, "name"),
      describeOffenders(productionLanguages, "name"),
    ]
      .filter(Boolean)
      .join("; ");
    throw new RestoreLessonAbortError(
      15,
      `Cross-database language identity (I22) cannot be established: neither "code" nor ` +
        `"name" is non-null and unique on both databases. code offenders: [${codeOffenders}]. ` +
        `name offenders: [${nameOffenders}]. Populate languages.code uniquely and re-run.`
    );
  }

  const snapshotByKey = new Map<string, Language>();
  for (const language of snapshotLanguages) {
    snapshotByKey.set(String(language[matchedBy]), language);
  }
  const productionByKey = new Map<string, Language>();
  for (const language of productionLanguages) {
    productionByKey.set(String(language[matchedBy]), language);
  }

  const allKeys = new Set<string>([...snapshotByKey.keys(), ...productionByKey.keys()]);

  const checks: LanguageIdentityCheck[] = Array.from(allKeys).map((key) => {
    const snapshotLanguage = snapshotByKey.get(key) ?? null;
    const productionLanguage = productionByKey.get(key) ?? null;
    const snapshotLanguageId = snapshotLanguage?.languageId ?? null;
    const productionLanguageId = productionLanguage?.languageId ?? null;
    const agrees =
      snapshotLanguageId !== null && productionLanguageId !== null
        ? snapshotLanguageId === productionLanguageId
        : productionLanguageId !== null; // production-only is fine; snapshot-only is not (evaluated below)

    return {
      matchedBy,
      key,
      snapshotLanguageId,
      productionLanguageId,
      snapshotCode: snapshotLanguage?.code ?? null,
      productionCode: productionLanguage?.code ?? null,
      snapshotName: snapshotLanguage?.name ?? null,
      productionName: productionLanguage?.name ?? null,
      agrees,
    };
  });

  // Fatal: a matched pair disagrees on languageId.
  const divergent = checks.find(
    (c) => c.snapshotLanguageId !== null && c.productionLanguageId !== null && !c.agrees
  );
  if (divergent) {
    throw new RestoreLessonAbortError(
      15,
      `Cross-database language identity (I22) diverges for key "${divergent.key}" ` +
        `(matched by ${divergent.matchedBy}): snapshot languageId=${divergent.snapshotLanguageId}, ` +
        `production languageId=${divergent.productionLanguageId}. This is the wrong snapshot.`
    );
  }

  // Fatal: two (or more) snapshot languages map to the same production language.
  const productionIdCounts = new Map<number, LanguageIdentityCheck[]>();
  for (const check of checks) {
    if (check.snapshotLanguageId === null || check.productionLanguageId === null) continue;
    const group = productionIdCounts.get(check.productionLanguageId) ?? [];
    group.push(check);
    productionIdCounts.set(check.productionLanguageId, group);
  }
  for (const [productionLanguageId, group] of productionIdCounts) {
    if (group.length > 1) {
      throw new RestoreLessonAbortError(
        15,
        `Cross-database language identity (I22) fails: snapshot languages ` +
          `${group.map((c) => c.snapshotLanguageId).join(", ")} all map to a single ` +
          `production language (languageId=${productionLanguageId}).`
      );
    }
  }

  // Fatal: a snapshot-only language that has translations of the affected lesson.
  const orphans = checks.filter(
    (c) =>
      c.snapshotLanguageId !== null &&
      c.productionLanguageId === null &&
      input.snapshotLanguageIdsWithAffectedLessonTranslations.includes(c.snapshotLanguageId)
  );
  if (orphans.length > 0) {
    throw new RestoreLessonAbortError(
      15,
      `Cross-database language identity (I22) fails: snapshot language(s) ` +
        `${orphans.map((c) => `${c.snapshotName} (languageId=${c.snapshotLanguageId})`).join(", ")} ` +
        `have translations of the affected lesson but no production counterpart under the ` +
        `${matchedBy} join key.`
    );
  }

  return checks;
}
