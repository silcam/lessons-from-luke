/**
 * In-memory model for the `restoreLesson` task (spec 018-lesson1-translation-restore).
 *
 * These are plain data types — no methods, no I/O — so the pure diagnosis
 * core is unit-testable from fixtures. See:
 *   - specs/018-lesson1-translation-restore/data-model.md Part B
 *   - specs/018-lesson1-translation-restore/contracts/report.schema.json
 */

/** Cross-DB identity of a lesson, shared by AffectedLesson, MasterStringMapping's
 * `sharedWithLessons`, and DiagnosisReport's `blastRadius.lessons`. */
export interface LessonRef {
  book: string;
  series: number;
  lesson: number;
}

/** Result of FR-001 verification. */
export interface ServerIdentity {
  /** THIS_IS_THE_PRODUCTION_SERVER */
  productionMarkerPresent: boolean;
  /** operator-supplied, recorded in report */
  snapshotConfirmationToken: string;
  productionLessonVersion: number;
  snapshotLessonVersion: number;
  /** hard gate */
  snapshotIsOlder: boolean;
}

export type MappingStrategy = "findTSubsBridge" | "snapshotAnchored";

/** Output of FR-002 detection. */
export interface AffectedLesson {
  /** cross-DB identity */
  book: string;
  series: number;
  lesson: number;
  productionLessonId: number;
  snapshotLessonId: number;
  productionVersion: number;
  snapshotVersion: number;
  /** prod - snapshot */
  bumpCount: number;
  mappingStrategy: MappingStrategy;
  /** pinned at first diagnosis */
  knownBadVersions: number[];
  /** 1, +1 per tool-made bump */
  expectedBumpCount: number;
  /** production `lessons.modified` (ms) at diagnose time — i.e. when the bad
   * upload happened, since diagnosis runs while it is the current version.
   * Absent on reports written before this field existed. */
  productionLessonModified?: number | null;
  candidateMasterDocuments: MasterDocumentCandidate[];
}

/** Cross-database evidence that a `languageId` denotes the same language on
 * both sides (invariant I22). One entry per language seen in either database. */
export interface LanguageIdentityCheck {
  /** the key chosen at runtime */
  matchedBy: "code" | "name";
  /** its value */
  key: string;
  /** null = production-only language */
  snapshotLanguageId: number | null;
  /** null = snapshot-only language */
  productionLanguageId: number | null;
  snapshotCode: string | null;
  productionCode: string | null;
  snapshotName: string | null;
  productionName: string | null;
  /** ids equal, or production-only */
  agrees: boolean;
}

/** A historical ODT under `docs/` considered for the English restore (research D5). */
export interface MasterDocumentCandidate {
  filepath: string;
  /** parsed from the versioned filename */
  version: number | null;
  /** pinned at diagnose; re-checked at use (I23) */
  sha256: string;
  sizeBytes: number;
  englishTextSetMatchesSnapshot: boolean;
  /** version in AffectedLesson.knownBadVersions */
  isKnownBadUpload: boolean;
  /** snapshot English texts absent from the ODT */
  missingFromDocument: string[];
  /** ODT texts absent from the snapshot lesson */
  extraInDocument: string[];
}

/** One entry per pre-incident master string of the affected lesson. */
export interface MasterStringMapping {
  snapshotMasterId: number;
  /** null = no counterpart in production */
  productionMasterId: number | null;
  englishText: string;
  type: string;
  xpath: string;
  position: number;
  matchMethod: "identicalText" | "findTSubs" | "typeXpath" | "position" | "unmatched";
  /** referenced by current lessonstrings */
  reachableInProduction: boolean;
  /** blast radius (FR-004) */
  sharedWithLessons: LessonRef[];
}

/** The FR-008 decision for one (language, master string) pair. */
export type TranslationClassification = "restore" | "intact" | "conflict" | "newerWork" | "lost";

export interface TranslationFinding {
  languageId: number;
  languageName: string;
  languageArchived: boolean;
  snapshotMasterId: number;
  productionMasterId: number | null;
  classification: TranslationClassification;
  snapshotText: string | null;
  productionText: string | null;
  /** may be NULL - evidence only */
  productionModified: number | null;
  /** second orphan vector, counted */
  legacyLessonStringId: number | null;
  sampleEnglishText: string;
}

/** The write plan. One per row to be written; produced only from `restore` findings. */
export interface RestoreWrite {
  languageId: number;
  /** production-side masterId */
  masterId: number;
  /** always null (research D6) */
  lessonStringId: null;
  /** snapshot value */
  text: string;
  /** always empty on insert (research D6 defect 2) */
  history: [];
  sourceLanguageId: number | null;
  source: string | null;
}

/** A planned write actually applied. Produced by `apply`, reconciled from the journal. */
export interface AppliedWrite {
  languageId: number;
  masterId: number;
  text: string;
  /** Prior production value, now first in history. Null when the row was inserted. */
  overwrote: string | null;
  appliedAt: string;
}

/** A planned write withheld at apply time because production changed after the diagnosis. */
export interface DriftSkip {
  languageId: number;
  masterId: number;
  /** the snapshot value we would have written */
  plannedText: string;
  /** what production holds now */
  liveProductionText: string | null;
  reclassifiedAs: Exclude<TranslationClassification, "restore">;
  /** true iff reclassifiedAs === "intact" */
  benign: boolean;
  /** ISO 8601 */
  detectedAt: string;
}

/** Produced by `verify` (and `diagnose`'s `duplicateRowsBaseline`). */
export interface DuplicateRow {
  languageId: number;
  masterId: number;
  lessonStringId: number | null;
  rowCount: number;
  /** the distinct values found */
  texts: string[];
}

export type LanguageBatchStatus = "pending" | "completed" | "failed";

export interface LanguageBatch {
  languageId: number;
  status: LanguageBatchStatus;
  writesAttempted: number;
  writesApplied: number;
  driftSkipped: number;
  failureMessage: string | null;
  completedAt: string | null;
}

/** Batch-level journal, flushed to the report after every per-language batch. */
export interface ApplyState {
  startedAt: string;
  /** --languages; null = whole corpus */
  scopedLanguageIds: number[] | null;
  languageBatches: LanguageBatch[];
  completedAt: string | null;
}

/** Recorded by `restore-english`; its presence is `apply`'s precondition 8 and
 * the source of the expected-version rule. */
export interface EnglishRestore {
  method: "upload" | "relink";
  masterDocumentPath: string | null;
  /** the bytes actually consumed (I23) */
  masterDocumentSha256: string | null;
  newLessonVersion: number;
  /** this step's own rollback route */
  dumpPath: string;
  /** ISO 8601 */
  restoredAt: string;
  /** set when carried via --prior-report (I26) */
  carriedFromDiagnosisId: string | null;
}

export interface Verification {
  mode: "snapshot" | "offline";
  /** partial when apply was --languages-scoped */
  coverage: "complete" | "partial";
  /** languages with planned writes not yet applied */
  unappliedLanguageIds: number[];
  /** ISO 8601 */
  verifiedAt: string;
  clientReportPath: string;
  /** true when the duplicate delta is non-empty */
  clientReportWithheld: boolean;
}

/** Identity evidence re-checked by every write subcommand (invariant I13). */
export interface ProductionFingerprint {
  databaseName: string;
  lessonCount: number;
  maxMasterId: number;
  maxLessonStringId: number;
}

/** Feeds SC-002 and FR-013. */
export interface LanguageCounts {
  languageId: number;
  languageName: string;
  archived: boolean;
  /** pre-incident reachable translations */
  snapshotReachable: number;
  productionReachableBefore: number;
  /** apply/verify only */
  productionReachableAfter: number | null;
  restored: number;
  conflicts: number;
  newerWork: number;
  lost: number;
  /** apply only; planned but withheld (I11) */
  driftSkipped: number;
}

export type ReportMode = "diagnose" | "restore-english" | "apply" | "verify";

/** The durable artifact (`report.json`) that gates apply. See
 * `contracts/report.schema.json`. */
export interface DiagnosisReport {
  /** uuid; apply must be given this explicitly */
  diagnosisId: string;
  /** frozen at diagnose; the human-review gate */
  diagnosisChecksum: string;
  /** SHA-256 over the canonical body, excluding this field */
  reportChecksum: string;
  /** ISO 8601 */
  generatedAt: string;
  toolVersion: string;
  mode: ReportMode;
  identity: ServerIdentity;
  productionFingerprint: ProductionFingerprint;
  affectedLessons: AffectedLesson[];
  /** I22; diagnose, required */
  languageIdentityChecks: LanguageIdentityCheck[];
  mappings: MasterStringMapping[];
  findings: TranslationFinding[];
  perLanguageCounts: LanguageCounts[];
  legacyLessonStringRowCounts: { production: number; snapshot: number };
  nullModifiedCounts?: { production: number; snapshot: number };
  blastRadius: { sharedMasterIds: number; lessons: LessonRef[] };
  /** dry run: what WOULD be written */
  plannedWrites: RestoreWrite[];
  /** restore-english, or carried via --prior-report */
  englishRestore?: EnglishRestore;
  /** apply only; flushed after every batch */
  applyState?: ApplyState;
  /** apply only; reconciled from the journal */
  appliedWrites?: AppliedWrite[];
  /** apply only */
  driftSkips?: DriftSkip[];
  /** diagnose; pre-existing, not caused here */
  duplicateRowsBaseline: DuplicateRow[];
  /** verify only; residual-race detection */
  duplicateRows?: DuplicateRow[];
  verification?: Verification;
  /** set when --prior-report carried facts forward */
  priorDiagnosisId?: string;
  /** apply only (restore-english's is englishRestore.dumpPath) */
  preApplyDumpPath?: string;
  /** classification === "conflict" | "newerWork" */
  conflicts: TranslationFinding[];
}
