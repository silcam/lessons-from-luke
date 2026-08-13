/**
 * PGSnapshotStorage — read-only Persistence subclass for the migration
 * incident Snapshot database.
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Project Structure,
 * §Security & Privacy ("Snapshot credentials must not leak", "Least
 * privilege and blast radius"); research.md D1.
 *
 * Follows the `PGDevStorage`/`PGTestStorage` "subclass PGStorage, swap
 * `this.sql`" pattern (PGStorage.ts), but connects to an operator-supplied
 * Snapshot database — never `secrets.json` — and is read-only by three
 * independent guards (data-model.md I1), none trusted alone:
 *
 *  1. Every mutating `Persistence` method below throws `SnapshotIsReadOnlyError`
 *     synchronously, before any query executes.
 *  2. The Postgres session is opened with `default_transaction_read_only = on`.
 *  3. (operational, outside this class) the connection SHOULD use a
 *     SELECT-only Postgres role.
 *
 * The connection string is supplied by the caller (env var
 * `SNAPSHOT_DATABASE_URL` or `--snapshot-url`, resolved by the CLI — see
 * contracts/cli.md) so this class stays a pure "given a URL, connect"
 * subclass with no knowledge of argv/env. It is never logged or echoed
 * unredacted — see `redactConnectionUrl`.
 */
import postgres, { SqlFunc } from "postgres";
import PGStorage, { transformCol } from "./PGStorage";
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

export default class PGSnapshotStorage extends PGStorage {
  constructor(connectionUrl: string) {
    super();
    this.sql = snapshotDbConnect(connectionUrl);
  }

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

function snapshotDbConnect(connectionUrl: string): SqlFunc {
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
