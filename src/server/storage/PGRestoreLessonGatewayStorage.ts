/**
 * PGRestoreLessonGatewayStorage — bulk unfiltered row-fetch I/O layer for the
 * `restoreLesson` task (spec 018-lesson1-translation-restore).
 *
 * Spec: specs/018-lesson1-translation-restore/plan.md §Complexity Tracking
 * (raw SQL inside PGStorage subclasses, bypassing Persistence read-method
 * filtering), data-model.md I7 (archived languages enumerated), invariant
 * I22 note (unfiltered raw SQL for the languages join).
 *
 * Every method here issues raw SQL against `this.sql` — NOT the
 * `Persistence` interface's `languages()` / `tStrings()` methods, because
 * those filter out archived languages and legacy `lessonStringId`-scoped
 * rows, which is exactly what diagnosis must see. Each method is a thin,
 * individually unit-testable wrapper (fixture-driven, per research D11)
 * returning typed rows. None of these methods filter archived languages or
 * legacy `lessonStringId` rows when called the way diagnose/apply/verify
 * call them (unrestricted). They are reused identically by `diagnose`
 * (baseline), `apply`'s I11 drift re-check, and `verify`'s I19 sweep — do
 * not duplicate this SQL at those call sites.
 *
 * Follows the `PGDevStorage`/`PGTestStorage`/`PGSnapshotStorage` pattern
 * (`PGStorage.ts`): subclass `PGStorage`, then swap `this.sql` for the
 * caller-supplied connection — production, the Snapshot, or a reserved
 * advisory-lock connection all construct an instance of this class rather
 * than threading a bare `SqlFunc` through the task layer (amkj.14 —
 * cleanDB.ts precedent: raw SQL stays a `this.sql` method on a `PGStorage`
 * subclass, never a free function taking a connection parameter).
 */
import { SqlFunc } from "postgres";
import PGStorage from "./PGStorage";
import { Language } from "../../core/models/Language";
import { TString } from "../../core/models/TString";
import { BaseLesson, Book } from "../../core/models/Lesson";
import { DuplicateRow, LessonRef } from "../tasks/restoreLesson/types";

/** One entry per shared master ID, listing every lesson whose `lessonStrings` reference it. */
export interface MasterIdLessons {
  masterId: number;
  lessons: LessonRef[];
}

export default class PGRestoreLessonGatewayStorage extends PGStorage {
  constructor(sql: SqlFunc) {
    super();
    this.sql = sql;
  }

  /**
   * Every language row, active or archived. `includeArchived=false` restores
   * the `Persistence.languages()` filter for callers that want it, but
   * diagnose/apply/verify always call this with `includeArchived=true` — the
   * whole point of this gateway is to see archived languages (I7).
   */
  async fetchAllLanguages(includeArchived: boolean): Promise<Language[]> {
    if (includeArchived) {
      return this.sql`
        SELECT languageid, name, code, motherTongue, progress, defaultsrclang, archived
        FROM languages
        ORDER BY languageid
      `;
    }
    return this.sql`
      SELECT languageid, name, code, motherTongue, progress, defaultsrclang, archived
      FROM languages
      WHERE NOT archived
      ORDER BY languageid
    `;
  }

  /**
   * Every `tStrings` row for the given master IDs — unfiltered by archived
   * language, and (when `includeLegacyLessonStringScoped`) unioned with the
   * pre-migration rows scoped to this lesson via `lessonStringId` rather than
   * `masterId` alone (the second orphan vector — see `TranslationFinding.legacyLessonStringId`).
   */
  async fetchTStringsForLesson(
    lessonId: number,
    masterIds: number[],
    opts: { includeLegacyLessonStringScoped: boolean }
  ): Promise<TString[]> {
    const byMasterIdRows: TString[] = masterIds.length
      ? await this.sql`
          SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
          FROM tstrings
          WHERE masterid IN (${masterIds})
        `
      : [];

    if (!opts.includeLegacyLessonStringScoped) {
      return byMasterIdRows.sort((a, b) => a.masterId - b.masterId || a.languageId - b.languageId);
    }

    const byLegacyLessonStringIdRows: TString[] = await this.sql`
      SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
      FROM tstrings
      WHERE lessonstringid IN (
        SELECT lessonstringid FROM lessonstrings WHERE lessonid=${lessonId}
      )
    `;

    const seen = new Set<string>();
    const merged: TString[] = [];
    for (const row of [...byMasterIdRows, ...byLegacyLessonStringIdRows]) {
      const key = `${row.languageId}:${row.masterId}:${row.lessonStringId ?? "null"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
    return merged.sort((a, b) => a.masterId - b.masterId || a.languageId - b.languageId);
  }

  /**
   * Global count of `tStrings` rows still scoped by the legacy `lessonStringId`
   * mechanism, across the whole database (not lesson-scoped). Feeds
   * `DiagnosisReport.legacyLessonStringRowCounts` — call once against
   * production, once against the snapshot.
   */
  async fetchLegacyScopedCount(): Promise<number> {
    const rows = await this.sql`
      SELECT count(*) AS cnt FROM tstrings WHERE lessonstringid IS NOT NULL
    `;
    return Number(rows[0].cnt);
  }

  /** The current `lessons` row for a cross-DB `(book, series, lesson)` identity, or `null`. */
  async fetchLessonByBookSeriesLesson(
    book: Book,
    series: number,
    lesson: number
  ): Promise<(BaseLesson & { modified?: number }) | null> {
    const rows: (BaseLesson & { modified?: number })[] = await this.sql`
      SELECT lessonid, book, series, lesson, version, modified
      FROM lessons
      WHERE book=${book} AND series=${series} AND lesson=${lesson}
    `;
    return rows[0] ?? null;
  }

  /**
   * `tStrings` rows sharing a `(languageId, masterId, lessonStringId)` key more
   * than once — the residual write race sweep (plan.md §The residual write
   * race). Feeds `DiagnosisReport.duplicateRowsBaseline` / `verify`'s I19 sweep.
   */
  async fetchDuplicateRowSweep(masterIds: number[]): Promise<DuplicateRow[]> {
    if (masterIds.length === 0) return [];
    const rows = await this.sql`
      SELECT languageid, masterid, lessonstringid, count(*) AS rowcount, array_agg(DISTINCT text) AS texts
      FROM tstrings
      WHERE masterid IN (${masterIds})
      GROUP BY languageid, masterid, lessonstringid
      HAVING count(*) > 1
      ORDER BY languageid, masterid, lessonstringid
    `;
    return rows.map((row: any): DuplicateRow => ({
      languageId: row.languageId,
      masterId: row.masterId,
      lessonStringId: row.lessonStringId ?? null,
      rowCount: Number(row.rowcount),
      texts: row.texts,
    }));
  }

  /**
   * FR-004 blast radius: for each of the given master IDs, every `(book,
   * series, lesson)` that currently references it via `lessonStrings` — the
   * source data for `DiagnosisReport.blastRadius`. Callers exclude the lesson
   * under diagnosis themselves; this method does no filtering.
   */
  async fetchLessonsSharingMasterIds(masterIds: number[]): Promise<MasterIdLessons[]> {
    if (masterIds.length === 0) return [];
    const rows = await this.sql`
      SELECT ls.masterid AS masterid, l.book AS book, l.series AS series, l.lesson AS lesson
      FROM lessonstrings ls
      JOIN lessons l ON l.lessonid = ls.lessonid
      WHERE ls.masterid IN (${masterIds})
      ORDER BY ls.masterid, l.book, l.series, l.lesson
    `;
    const byMasterId = new Map<number, LessonRef[]>();
    for (const row of rows as any[]) {
      const list = byMasterId.get(row.masterId) ?? [];
      list.push({ book: row.book, series: row.series, lesson: row.lesson });
      byMasterId.set(row.masterId, list);
    }
    return Array.from(byMasterId.entries()).map(([masterId, lessons]) => ({ masterId, lessons }));
  }
}
