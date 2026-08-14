/**
 * PGSnapshotStorage — read-only gateway subclass for the migration incident
 * Snapshot database.
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Project Structure,
 * §Security & Privacy ("Snapshot credentials must not leak", "Least
 * privilege and blast radius"); research.md D1.
 *
 * Extends `PGRestoreLessonGatewayStorage` (not `PGStorage` directly) so the
 * Snapshot handle carries both the raw-SQL gateway read methods
 * (`fetchAllLanguages`, `fetchTStringsForLesson`, `fetchLegacyScopedCount`,
 * ...) that `restoreLesson`'s diagnose/apply/verify code needs against the
 * Snapshot, AND the throwing mutator overrides below (amkj.15 — before this
 * change, cli.ts wrapped the Snapshot connection in a bare
 * `PGConnectedStorage extends PGRestoreLessonGatewayStorage`, which has none
 * of these overrides: guard 1 was dead code). It is read-only by three
 * independent guards (data-model.md I1), none trusted alone:
 *
 *  1. Every mutating `Persistence` method below throws `SnapshotIsReadOnlyError`
 *     synchronously, before any query executes.
 *  2. The Postgres session is opened with `default_transaction_read_only = on`.
 *  3. (operational, outside this class) the connection SHOULD use a
 *     SELECT-only Postgres role.
 *
 * The constructor takes an already-connected `SqlFunc` (per the
 * `PGDevStorage`/`PGTestStorage`/`PGRestoreLessonGatewayStorage` "subclass,
 * then swap `this.sql`" pattern) rather than a connection URL, so callers
 * open the connection via `snapshotDbConnect` (guard 2) — and can inject a
 * test double for it — before wrapping it here. It is never logged or
 * echoed unredacted — see `redactConnectionUrl`.
 */
import postgres, { SqlFunc } from "postgres";
import { transformCol } from "./PGStorage";
import PGRestoreLessonGatewayStorage from "./PGRestoreLessonGatewayStorage";
import { NewLanguage, Language } from "../../core/models/Language";
import { DraftLesson, BaseLesson, Lesson } from "../../core/models/Lesson";
import { DraftLessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { ArchiveLanguageResult } from "../../core/interfaces/Api";

/**
 * Thrown by every mutating `Persistence` method on `PGSnapshotStorage`. A
 * call here means the tool is mis-wired — the diagnosis/restore code is
 * supposed to route every write through `PGStorage` (production), never
 * through this class.
 */
export class SnapshotIsReadOnlyError extends Error {
  code = "SNAPSHOT_READ_ONLY" as const;
  constructor(method: string) {
    super(`PGSnapshotStorage is read-only: ${method}() is not permitted on the snapshot database`);
    this.name = "SnapshotIsReadOnlyError";
  }
}

/**
 * Redacts a Postgres connection URL to `postgres://user:***@host:port/db`
 * so it is safe to include in logs, `--json` output, error messages, or the
 * report (plan.md "Snapshot credentials must not leak"). Falls back to a
 * fixed placeholder — never the raw input — if the string isn't a
 * parseable URL.
 */
export function redactConnectionUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const user = decodeURIComponent(parsed.username) || "user";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${user}:***@${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return "postgres://***redacted***";
  }
}

const TLS_SSLMODES = new Set(["require", "verify-ca", "verify-full"]);

/**
 * True when `hostname` is a loopback address (127.0.0.0/8, `::1`, or
 * `localhost`) — i.e. the Snapshot database is expected to be reached
 * through a local SSH tunnel, per specs/018-lesson1-translation-restore
 * contracts/cli.md §Connections and quickstart.md step 2.
 */
function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "::1" || host === "[::1]" || host.startsWith("127.");
}

/**
 * Returns a warning message (host-naming, password-free) when `connectionUrl`
 * neither points at a loopback address (the expected SSH-tunnel endpoint)
 * nor requests TLS via `sslmode=require|verify-ca|verify-full` — i.e. the
 * connection is at risk of sending the Snapshot password and every row of
 * translation/English source text in cleartext. Returns `null` when the URL
 * is loopback, TLS-protected, or unparseable (fails closed by not warning on
 * garbage the caller will fail to connect with anyway).
 *
 * Callers MUST still pass the result through `redactConnectionString` before
 * writing it anywhere — this function never embeds the password, but a
 * defense-in-depth redaction pass costs nothing.
 */
export function snapshotUrlSecurityWarning(connectionUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return null;
  }

  if (isLoopbackHost(parsed.hostname)) return null;

  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode && TLS_SSLMODES.has(sslmode)) return null;

  return (
    `Snapshot database host "${parsed.hostname}" is neither loopback nor configured with TLS ` +
    `(sslmode=require|verify-ca|verify-full). The expected setup is an SSH tunnel to ` +
    `127.0.0.1 (see quickstart.md step 2) — without it, the Snapshot password and every row ` +
    `of translation/English source text read from it travel in cleartext.`
  );
}

export default class PGSnapshotStorage extends PGRestoreLessonGatewayStorage {
  // constructor is inherited from PGRestoreLessonGatewayStorage:
  // constructor(sql: SqlFunc) { super(); this.sql = sql; }
  // Callers connect via `snapshotDbConnect(url)` first (guard 2), then wrap
  // the resulting `SqlFunc` here — see cli.ts's `runDiagnoseCommand`.

  // ── Mutating Persistence methods: throw before any query executes ──────

  async createLanguage(_lang: NewLanguage): Promise<Language> {
    throw new SnapshotIsReadOnlyError("createLanguage");
  }

  async updateLanguage(_id: number, _update: Partial<Language>): Promise<Language> {
    throw new SnapshotIsReadOnlyError("updateLanguage");
  }

  async updateLanguageChecked(_id: number, _update: Partial<Language>): Promise<Language> {
    throw new SnapshotIsReadOnlyError("updateLanguageChecked");
  }

  async archiveLanguage(_languageId: number): Promise<ArchiveLanguageResult> {
    throw new SnapshotIsReadOnlyError("archiveLanguage");
  }

  async createLesson(_lesson: DraftLesson): Promise<BaseLesson> {
    throw new SnapshotIsReadOnlyError("createLesson");
  }

  async updateLesson(
    _id: number,
    _lessonVersion: number,
    _lessonStrings: DraftLessonString[]
  ): Promise<Lesson> {
    throw new SnapshotIsReadOnlyError("updateLesson");
  }

  async addOrFindMasterStrings(_texts: string[]): Promise<TString[]> {
    throw new SnapshotIsReadOnlyError("addOrFindMasterStrings");
  }

  async saveTStrings(
    _tStrings: TString[],
    _opts: { awaitProgress?: boolean } = {}
  ): Promise<TString[]> {
    throw new SnapshotIsReadOnlyError("saveTStrings");
  }

  async updateProgress(): Promise<void> {
    throw new SnapshotIsReadOnlyError("updateProgress");
  }
}

export function snapshotDbConnect(connectionUrl: string): SqlFunc {
  try {
    return postgres(connectionUrl, {
      transform: { column: transformCol },
      // Sent as Postgres startup parameters, applied to every physical
      // connection this pool opens. `default_transaction_read_only` has GUC
      // context "user", so it is settable per-connection at startup — unlike
      // a `SET` issued after connect, which only affects whichever pooled
      // socket happens to run it.
      connection: { default_transaction_read_only: true },
    });
  } catch (err) {
    throw new Error(
      `Failed to connect to snapshot database at ${redactConnectionUrl(connectionUrl)}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    );
  }
}
