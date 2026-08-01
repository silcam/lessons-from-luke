import postgres, { SqlFunc, Options } from "postgres";
import { Persistence, TestPersistence } from "../../core/interfaces/Persistence";
import {
  Language,
  NewLanguage,
  LessonProgress,
  ENGLISH_ID,
  calcLessonProgress,
} from "../../core/models/Language";
import prexit from "prexit";
import { Lesson, DraftLesson, BaseLesson } from "../../core/models/Lesson";
import { DraftLessonString, LessonString } from "../../core/models/LessonString";
import { TString, equal, sqlizeTString } from "../../core/models/TString";
import { ContinuousSyncPackage } from "../../core/models/SyncState";
import { encode } from "../../core/util/timestampEncode";
import { uniq, discriminate, findBy } from "../../core/util/arrayUtils";
import { VerseStringPattern } from "../usfm/translateFromUsfm";
import pgLoadFixtures from "./pgLoadFixtures";
import secrets from "../util/secrets";
import { LanguageTimestamp, ArchiveLanguageResult } from "../../core/interfaces/Api";

export default class PGStorage implements Persistence {
  sql: SqlFunc;

  constructor() {
    this.sql = dbConnect();
    prexit(this.close);
  }

  async languages(): Promise<Language[]> {
    const langs = this.sql`
      SELECT languageid, name, code, motherTongue, progress, defaultsrclang, archived
      FROM languages
      WHERE NOT archived
    `;
    return langs;
  }

  async language(params: { languageId: number } | { code: string }): Promise<Language | null> {
    const rows = await this.sql`
      SELECT languageid, name, code, motherTongue, progress, defaultsrclang, archived
      FROM languages
      WHERE ${this.sql(params)} AND NOT archived
    `;
    return rows[0] || null;
  }

  // Runs `fn` on the INSTANCE `this.sql` (not a module-level connection) so
  // `TransactionalTestStorage` nests it correctly: at the top level
  // `this.sql` is a root connection (has `.begin`), but
  // `TransactionalTestStorage` swaps `this.sql` to the per-test transaction's
  // scoped sql for the duration of a test — postgres@1's scoped tx sql only
  // exposes `.savepoint` (not `.begin`), so we pick whichever is present.
  // Either way this nests on the SAME connection as the caller's `this.sql`.
  // The `any` cast is confined to this single helper.
  private runInTx<T>(fn: (tx: SqlFunc) => Promise<T>): Promise<T> {
    const sql: any = this.sql;
    const runInTransaction = (sql.begin ? sql.begin : sql.savepoint).bind(sql);
    return runInTransaction(fn);
  }

  // Runs `fn` (a runInTx call) and translates a Postgres 23505 (unique
  // violation) escaping it into { status: 409 }. MUST wrap the runInTx call
  // itself, not run *inside* the transactional callback: a unique violation
  // aborts the current (sub)transaction, so catching and swallowing it
  // inside the callback would leave the connection in an aborted state for
  // whatever statement runs next. Letting the error propagate out of the
  // callback lets postgres.js issue the ROLLBACK/ROLLBACK TO SAVEPOINT
  // itself, and only then do we translate it here at the boundary.
  //
  // This is the backstop for the languages_name_active_lower_idx partial
  // unique index (lessons-from-luke-fm4a.9): the app-level
  // case-insensitive duplicate-name check run FOR UPDATE inside the
  // transaction closes the race when a conflicting row already exists to
  // lock, but takes no lock at all when it finds zero rows — so two
  // concurrent writes racing toward the same brand-new name can both pass
  // the app-level check. The database index is the actual serialization
  // point for that case; the loser's INSERT/UPDATE fails with 23505, which
  // this maps to the same 409 the app-level check produces.
  private async mapUniqueViolationTo409<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
        throw { status: 409 };
      }
      throw err;
    }
  }

  async createLanguage(newLanguage: NewLanguage): Promise<Language> {
    return this.mapUniqueViolationTo409(() =>
      this.runInTx(async (tx: SqlFunc) => {
        const [source] = await tx`
          SELECT languageid FROM languages WHERE languageId=${newLanguage.defaultSrcLang} AND NOT archived FOR UPDATE
        `;
        if (!source) throw { status: 422 };

        const timestamp = Date.now();
        const newLang = {
          ...newLanguage,
          code: encode(),
          motherTongue: true,
          progress: "[]",
          created: timestamp,
          modified: timestamp,
        };
        const [final] = await tx`
          INSERT INTO languages
            ${tx(newLang)}
            returning *`;
        return final;
      })
    );
  }

  async updateLanguage(id: number, update: Partial<Language>): Promise<Language> {
    const finalUpdate = { ...update, modified: Date.now() };
    await this.sql`UPDATE languages SET ${this.sql(finalUpdate)} WHERE languageId=${id}`;
    await this.updateProgress();
    return (await this.language({ languageId: id }))!;
  }

  // Like updateLanguage, but (a) rejects with { status: 404 } unless the
  // target itself is active, (b) when `update.defaultSrcLang` is present
  // AND differs from the row's current value, validates the new source is
  // active (locked FOR UPDATE) before applying — rejects with
  // { status: 422 } if missing or archived, and (c) when `update.name` is
  // present, rejects with { status: 409 } if it case-insensitively collides
  // with another active language's name.
  //
  // The (c) check runs FOR UPDATE inside the SAME transaction as the write
  // below, which closes the race when a conflicting ACTIVE row already
  // exists (the check locks it, serializing against it). It does NOT close
  // the race when both concurrent renames target a brand-new name: a
  // `SELECT ... FOR UPDATE` matching zero rows takes no lock, so two such
  // writes can both pass this check. The languages_name_active_lower_idx
  // partial unique index (migrations/1784766630015) is the real
  // serialization point for that case — mapUniqueViolationTo409 (wrapping
  // this whole call) turns the loser's resulting 23505 into the same 409.
  // Runs via runInTx — see its comment for why the transaction-starter is
  // picked dynamically.
  //
  // `updateLanguage` deliberately keeps NO archived filter: it is how tests
  // (and only tests) flip `archived` in the first place.
  async updateLanguageChecked(id: number, update: Partial<Language>): Promise<Language> {
    await this.mapUniqueViolationTo409(() =>
      this.runInTx(async (tx: SqlFunc) => {
        const [row] = await tx`
          SELECT languageid, defaultsrclang FROM languages
          WHERE languageId=${id} AND NOT archived FOR UPDATE
        `;
        // No active row: nonexistent or archived. Both are a 404 — an
        // archived language must not be mutable through the generic update
        // endpoint.
        if (!row) throw { status: 404 };

        if (update.defaultSrcLang !== undefined && update.defaultSrcLang !== row.defaultSrcLang) {
          const [source] = await tx`
            SELECT languageid FROM languages WHERE languageId=${update.defaultSrcLang} AND NOT archived FOR UPDATE
          `;
          if (!source) throw { status: 422 };
        }

        if (update.name !== undefined) {
          const [duplicate] = await tx`
            SELECT languageid FROM languages
            WHERE languageId != ${id} AND NOT archived AND lower(name) = lower(${update.name})
            FOR UPDATE
          `;
          if (duplicate) throw { status: 409 };
        }

        const finalUpdate = { ...update, modified: Date.now() };
        await tx`UPDATE languages SET ${tx(finalUpdate)} WHERE languageId=${id}`;
      })
    );
    await this.updateProgress();
    // Safe post-update: the locked `AND NOT archived` predicate above proves
    // the target was active, and this method never sets `archived`, so a
    // re-read through `language()` (which filters out archived rows) always
    // finds it.
    return (await this.language({ languageId: id }))!;
  }

  // Archives a language iff no other active language depends on it as a
  // defaultSrcLang. Runs via runInTx — see its comment for why the
  // transaction-starter is picked dynamically.
  async archiveLanguage(languageId: number): Promise<ArchiveLanguageResult> {
    return this.runInTx(async (tx: SqlFunc) => {
      const [row] = await tx`
        SELECT languageid FROM languages WHERE languageId=${languageId} AND NOT archived FOR UPDATE
      `;
      // No active row: nonexistent or already archived. Surfaced as a 404 at
      // the controller layer (contract: archive-language.md).
      if (!row) throw { status: 404 };

      const dependents: { languageId: number; name: string }[] = await tx`
        SELECT languageid, name FROM languages
        WHERE NOT archived AND defaultSrcLang=${languageId} AND languageId != ${languageId}
      `;
      if (dependents.length > 0) {
        return { error: "HAS_DEPENDENTS", dependents };
      }

      await tx`UPDATE languages SET archived=true, modified=${Date.now()} WHERE languageId=${languageId}`;
      return { archived: true, languageId };
    });
  }

  async invalidCode(code: string, languageIds: number[]): Promise<boolean> {
    const language = await this.language({ code });
    if (!language) return true;
    return !languageIds.every((id) => id == language.languageId);
  }

  async lessons(): Promise<BaseLesson[]> {
    return this.sql`
      SELECT lessonid, book, series, lesson, version FROM lessons ORDER BY lessonid
      `;
  }

  async lesson(id: number): Promise<Lesson | null> {
    const rows = await this.sql`
      SELECT lessonid, book, series, lesson, version FROM lessons WHERE lessonId=${id}
    `;
    const lesson: BaseLesson | undefined = rows[0];
    if (!lesson) return null;
    const lsRows = await this
      .sql`SELECT * FROM lessonStrings WHERE lessonId=${id} ORDER BY lessonStringId`;
    return { ...lesson, lessonStrings: lsRows };
  }

  async createLesson(lesson: DraftLesson): Promise<BaseLesson> {
    const timestamp = Date.now();
    const newLesson: Omit<BaseLesson, "lessonId"> = { ...lesson, version: 0 };
    const insert = { ...newLesson, created: timestamp, modified: timestamp };
    const [finalLesson] = await this.sql`INSERT INTO lessons ${this.sql(insert)} returning *`;
    return finalLesson;
  }

  async updateLesson(
    id: number,
    lessonVersion: number,
    lessonStrings: DraftLessonString[]
  ): Promise<Lesson> {
    return this.withProgressUpdate(async () => {
      const lesson: BaseLesson | undefined = (
        await this.sql`
      UPDATE lessons 
      SET version=${lessonVersion}, modified=${Date.now()} 
      WHERE lessonid=${id}
      returning *
    `
      )[0];
      if (!lesson) throw `No such lesson id=${id}`;

      const oldLessonStrings: LessonString[] = await this.sql`
        DELETE FROM lessonstrings WHERE lessonid=${id}
        returning *
      `;

      if (oldLessonStrings.length > 0)
        await this.sql`INSERT INTO oldlessonstrings ${this.sql(oldLessonStrings)}`;

      const newLessonStringInserts = lessonStrings.map((ls) => ({
        ...ls,
        lessonVersion: lessonVersion,
      }));
      const newLessonStrings: LessonString[] = await this.sql`
      INSERT INTO lessonstrings ${this.sql(newLessonStringInserts)}
      returning *
    `;

      return { ...lesson, lessonStrings: newLessonStrings };
    });
  }

  async oldLessonStrings(lessonId: number, version?: number): Promise<LessonString[]> {
    return version
      ? this
          .sql`SELECT * FROM oldLessonStrings WHERE lessonId=${lessonId} AND lessonVersion=${version} ORDER BY lessonStringId`
      : this.sql`SELECT * FROM oldLessonStrings WHERE lessonId=${lessonId} ORDER BY lessonStringId`;
  }

  // An archived language reads exactly like a nonexistent one: [] (200 + []
  // at the API, never a 404) — see data-model.md "Read-path filtering".
  //
  // The `EXISTS` guard is repeated inline in all three branches rather than
  // factored into a shared fragment because postgres@1 has no fragment
  // composition: a nested sql`` object is bound as a *value*, not spliced
  // (lib/index.js parseValue/addValue). A preliminary `SELECT 1` guard would
  // instead cost one extra round-trip per call, and `updateProgress` calls
  // this once per active language on every save. The guard is uncorrelated
  // (only a bound param), so Postgres evaluates it once against the languages
  // PK and skips the tStrings scan entirely when it is false.
  async tStrings(params: {
    languageId: number;
    lessonId?: number;
    masterIds?: number[];
  }): Promise<TString[]> {
    if (params.lessonId) {
      const lessonStrings = await this
        .sql`SELECT * FROM lessonstrings WHERE lessonid=${params.lessonId}`;
      if (lessonStrings.length == 0) return [];

      const masterIds = lessonStrings.map((ls) => ls.masterId);
      const lessonStringIds = lessonStrings.map((ls) => ls.lessonStringId);
      return this.sql`
        SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
        FROM tStrings
        WHERE languageId=${params.languageId}
        AND masterId IN (${masterIds})
        AND (lessonStringId IN (${lessonStringIds}) OR lessonStringId IS NULL)
        AND EXISTS (SELECT 1 FROM languages lang
                    WHERE lang.languageId=${params.languageId} AND NOT lang.archived)
        ORDER BY masterid
      `;
    } else if (params.masterIds) {
      return this.sql`
        SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
        FROM tStrings
        WHERE languageId=${params.languageId}
        AND masterId IN (${params.masterIds})
        AND EXISTS (SELECT 1 FROM languages lang
                    WHERE lang.languageId=${params.languageId} AND NOT lang.archived)
        ORDER BY masterid
      `;
    } else {
      return this.sql`
        SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
        FROM tStrings
        WHERE ${this.sql(params)}
        AND EXISTS (SELECT 1 FROM languages lang
                    WHERE lang.languageId=${params.languageId} AND NOT lang.archived)
        ORDER BY masterid
      `;
    }
  }

  async englishScriptureTStrings() {
    const engStrings = await this.tStrings({ languageId: ENGLISH_ID });
    return engStrings.filter((tStr) => VerseStringPattern.test(tStr.text));
  }

  async addOrFindMasterStrings(texts: string[]) {
    return this.withProgressUpdate(async () => {
      const engStrings = await this.tStrings({ languageId: ENGLISH_ID });
      const tStrings: TString[] = [];
      for (let i = 0; i < texts.length; ++i) {
        const text = texts[i];
        const found = findBy(engStrings, "text", text);
        if (found) {
          tStrings.push(found);
        } else {
          const draftTString: Omit<TString, "masterId"> = {
            languageId: ENGLISH_ID,
            text,
            history: [],
          };
          const [newTString]: TString[] = await this.sql`
          INSERT INTO tstrings ${this.sql(sqlizeTString(draftTString))}
          returning *
        `;
          engStrings.push(newTString);
          tStrings.push(newTString);
        }
      }
      return tStrings;
    });
  }

  async saveTStrings(tStrings: TString[], opts: { awaitProgress?: boolean } = {}) {
    tStrings = uniq(tStrings, (a, b) => a.masterId == b.masterId);
    const langIds = uniq(tStrings.map((ts) => ts.languageId));
    const existingStrings: TString[] = await this
      .sql`SELECT * FROM tstrings WHERE languageid IN (${langIds})`;

    const tStringsWithHistory = tStrings.reduce((tStrings: TString[], tStr) => {
      const existing = existingStrings.find((e) => equal(e, tStr));
      if (existing && existing.text == tStr.text) return tStrings;
      tStrings.push(existing ? { ...tStr, history: [...existing.history, existing.text] } : tStr);
      return tStrings;
    }, []);
    const [toUpdate, toAdd] = discriminate(tStringsWithHistory, (tStr) => tStr.history.length > 0);

    const timestamp = Date.now();
    if (toAdd.length > 0)
      await this.sql`INSERT INTO tstrings ${this.sql(
        toAdd.map((tStr) => ({
          ...sqlizeTString(tStr),
          created: timestamp,
          modified: timestamp,
        }))
      )}`;

    await Promise.all(
      toUpdate.map((tStr) => {
        const set = { ...sqlizeTString(tStr), modified: timestamp };
        return tStr.lessonStringId == null
          ? this.sql`UPDATE tstrings SET ${this.sql(set)}
                     WHERE languageid=${tStr.languageId}
                     AND masterid=${tStr.masterId}
                     AND lessonstringid IS NULL`
          : this.sql`UPDATE tstrings SET ${this.sql(set)}
                     WHERE languageid=${tStr.languageId}
                     AND masterid=${tStr.masterId}
                     AND lessonstringid=${tStr.lessonStringId}`;
      })
    );

    if (opts.awaitProgress) await this.updateProgress();
    else this.updateProgress(); // Without await

    return tStringsWithHistory;
  }

  async withProgressUpdate<T>(cb: () => Promise<T>) {
    const val = await cb();
    this.updateProgress(); // Don't await
    return val;
  }

  async updateProgress() {
    try {
      const languages = await this.languages();
      const lessons = await this.lessons();
      const allLessonStrings: LessonString[][] = await Promise.all(
        lessons.map(
          (lesson) => this.sql`
          SELECT * FROM lessonstrings WHERE lessonid=${lesson.lessonId}
        `
        )
      );
      const lessonStrings = allLessonStrings.filter((lss) => lss.length > 0);

      await Promise.all(
        languages.map(async (language) => {
          const tStrings = await this.tStrings({
            languageId: language.languageId,
          });
          const langProgress: LessonProgress[] = lessonStrings.map((lStrings) =>
            calcLessonProgress(language.motherTongue, lStrings, tStrings)
          );
          await this.sql`
          UPDATE languages SET progress=${this.sql.json(
            langProgress
          )} WHERE languageid=${language.languageId}
        `;
        })
      );
    } catch (err) {
      if (process.env.NODE_ENV == "production")
        console.error(`Unexpected error while updating progress: ${err}`);
    }
  }

  async sync(
    timestamp: number,
    languageTimestamps: LanguageTimestamp[]
  ): Promise<ContinuousSyncPackage> {
    const now = Date.now();
    let rows = await this.sql`
      SELECT max(created) FROM languages
    `;
    const langsTimestamp = rows[0].max;
    rows = await this.sql`
      SELECT max(created) FROM lessons
    `;
    const lessonsTimestamp = rows[0].max;
    const lessons = await this.sql`
      SELECT lessonid FROM lessons
      WHERE modified > ${timestamp}
    `;
    const tStringsByLangId: { [id: number]: number[] } = {};
    for (let i = 0; i < languageTimestamps.length; ++i) {
      const { languageId, timestamp: langTimeStamp } = languageTimestamps[i];
      const tStrings: { masterId: number }[] = await this.sql`
        SELECT DISTINCT tstrings.masterid 
        FROM tstrings JOIN lessonstrings ON tstrings.masterid=lessonstrings.masterid 
        WHERE tstrings.languageid = ${languageId}
        AND tstrings.modified > ${langTimeStamp}
    `;
      tStringsByLangId[languageId] = tStrings.map((tStr) => tStr.masterId);
    }

    return {
      languages: langsTimestamp > timestamp,
      baseLessons: lessonsTimestamp > timestamp,
      lessons: lessons.map((lsn) => lsn.lessonId),
      tStrings: tStringsByLangId,
      timestamp: now,
    };
  }

  async close() {
    await this.sql.end();
  }
}

export class PGTestStorage extends PGStorage implements TestPersistence {
  constructor() {
    super();
    // Replace connection with test database
    this.sql = testDbConnect();
  }

  async reset() {
    await pgLoadFixtures(this.sql);
  }

  async writeToDisk() {
    // Later...
  }
}

export class PGDevStorage extends PGStorage {
  constructor() {
    super();
    this.sql = devDbConnect();
  }
}

function dbConnect() {
  const opts: Options = {
    ...secrets.db,
    transform: {
      column: transformCol,
    },
    debug: (_con, _query, _params) => {
      // if (true) {
      //   console.log(`QUERY: ${query}`);
      //   console.log(JSON.stringify(params));
      // }
    },
  };
  return postgres(opts);
}

function testDbConnect() {
  const opts: Options = {
    ...secrets.testDb,
    transform: {
      column: transformCol,
    },
  };
  return postgres(opts);
}

function devDbConnect() {
  const opts: Options = {
    ...secrets.devDb,
    transform: {
      column: transformCol,
    },
  };
  return postgres(opts);
}

export function transformCol(col: string) {
  const cols = [
    "languageId",
    "motherTongue",
    "lessonId",
    "lessonStringId",
    "masterId",
    "lessonVersion",
    "sourceLanguageId",
    "defaultSrcLang",
  ];
  return cols.find((colName) => colName.toLocaleLowerCase() == col) || col;
}
