import postgres, { SqlFunc, Options } from "postgres";
import {
  Persistence,
  TestPersistence
} from "../../core/interfaces/Persistence";
import {
  Language,
  NewLanguage,
  LessonProgress,
  ENGLISH_ID
} from "../../core/models/Language";
import prexit from "prexit";
import { Lesson, DraftLesson, BaseLesson } from "../../core/models/Lesson";
import {
  DraftLessonString,
  LessonString
} from "../../core/models/LessonString";
import { TString, equal, sqlizeTString } from "../../core/models/TString";
import { ContinuousSyncPackage } from "../../core/models/SyncState";
import { encode } from "../../core/util/timestampEncode";
import { uniq, discriminate, findBy } from "../../core/util/arrayUtils";
import { VerseStringPattern } from "../usfm/translateFromUsfm";
import { percent } from "../../core/util/numberUtils";
import pgLoadFixtures from "./pgLoadFixtures";
import secrets from "../util/secrets";
import { LanguageTimestamp } from "../../core/interfaces/Api";

export default class PGStorage implements Persistence {
  sql: SqlFunc;

  constructor() {
    this.sql = dbConnect();
    prexit(this.close);
  }

  async languages(): Promise<Language[]> {
    const langs = this.sql`
      SELECT languageid, name, code, motherTongue, progress, defaultsrclang
      FROM languages
    `;
    return langs;
  }

  async language(
    params: { languageId: number } | { code: string }
  ): Promise<Language | null> {
    const rows = await this.sql`
      SELECT languageid, name, code, motherTongue, progress, defaultsrclang 
      FROM languages 
      WHERE ${this.sql(params)}
    `;
    return rows[0] || null;
  }

  async createLanguage(newLanguage: NewLanguage): Promise<Language> {
    const timestamp = Date.now();
    const newLang = {
      ...newLanguage,
      code: encode(),
      motherTongue: true,
      progress: "[]",
      created: timestamp,
      modified: timestamp
    };
    const [final] = await this.sql`
      INSERT INTO languages 
        ${this.sql(newLang)} 
        returning *`;
    return final;
  }

  async updateLanguage(
    id: number,
    update: Partial<Language>
  ): Promise<Language> {
    const finalUpdate = { ...update, modified: Date.now() };
    await this.sql`UPDATE languages SET ${this.sql(
      finalUpdate
    )} WHERE languageId=${id}`;
    await this.updateProgress();
    return (await this.language({ languageId: id }))!;
  }

  async invalidCode(code: string, languageIds: number[]): Promise<boolean> {
    const language = await this.language({ code });
    if (!language) return true;
    return !languageIds.every(id => id == language.languageId);
  }

  async lessons(): Promise<BaseLesson[]> {
    return this.sql`
      SELECT lessonid, book, series, lesson, version FROM lessons
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
    const [finalLesson] = await this.sql`INSERT INTO lessons ${this.sql(
      insert
    )} returning *`;
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
        await this.sql`INSERT INTO oldlessonstrings ${this.sql(
          oldLessonStrings
        )}`;

      const newLessonStringInserts = lessonStrings.map(ls => ({
        ...ls,
        lessonVersion: lessonVersion
      }));
      const newLessonStrings: LessonString[] = await this.sql`
      INSERT INTO lessonstrings ${this.sql(newLessonStringInserts)}
      returning *
    `;

      return { ...lesson, lessonStrings: newLessonStrings };
    });
  }

  async oldLessonStrings(
    lessonId: number,
    version: number
  ): Promise<LessonString[]> {
    return this
      .sql`SELECT * FROM oldLessonStrings WHERE lessonId=${lessonId} AND lessonVersion=${version} ORDER BY lessonStringId`;
  }

  async tStrings(params: {
    languageId: number;
    lessonId?: number;
    masterIds?: number[];
  }): Promise<TString[]> {
    if (params.lessonId) {
      const lessonStrings = await this
        .sql`SELECT * FROM lessonstrings WHERE lessonid=${params.lessonId}`;
      if (lessonStrings.length == 0) return [];

      const masterIds = lessonStrings.map(ls => ls.masterId);
      return this.sql`
        SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid 
        FROM tStrings 
        WHERE languageId=${params.languageId} 
        AND masterId IN (${masterIds})
      `;
    } else if (params.masterIds) {
      return this.sql`
        SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
        FROM tStrings 
        WHERE languageId=${params.languageId} 
        AND masterId IN (${params.masterIds})
      `;
    } else {
      return this.sql`
        SELECT masterid, languageid, sourcelanguageid, source, text, history, lessonstringid
        FROM tStrings
        WHERE ${this.sql(params)}
      `;
    }
  }

  async englishScriptureTStrings() {
    const engStrings = await this.tStrings({ languageId: ENGLISH_ID });
    return engStrings.filter(tStr => VerseStringPattern.test(tStr.text));
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
            history: []
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

  async saveTStrings(
    tStrings: TString[],
    opts: { awaitProgress?: boolean } = {}
  ) {
    tStrings = uniq(tStrings, (a, b) => a.masterId == b.masterId);
    const langIds = uniq(tStrings.map(ts => ts.languageId));
    const existingStrings: TString[] = await this
      .sql`SELECT * FROM tstrings WHERE languageid IN (${langIds})`;

    const tStringsWithHistory = tStrings.reduce((tStrings: TString[], tStr) => {
      const existing = existingStrings.find(e => equal(e, tStr));
      if (existing && existing.text == tStr.text) return tStrings;
      tStrings.push(
        existing
          ? { ...tStr, history: [...existing.history, existing.text] }
          : tStr
      );
      return tStrings;
    }, []);
    const [toUpdate, toAdd] = discriminate(
      tStringsWithHistory,
      tStr => tStr.history.length > 0
    );

    const timestamp = Date.now();
    if (toAdd.length > 0)
      await this.sql`INSERT INTO tstrings ${this.sql(
        toAdd.map(tStr => ({
          ...sqlizeTString(tStr),
          created: timestamp,
          modified: timestamp
        }))
      )}`;

    await Promise.all(
      toUpdate.map(
        tStr =>
          this.sql`UPDATE tstrings SET ${this.sql({
            ...sqlizeTString(tStr),
            modified: timestamp
          })} WHERE languageid=${tStr.languageId} AND masterid=${tStr.masterId}`
      )
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
          lesson => this.sql`
          SELECT * FROM lessonstrings WHERE lessonid=${lesson.lessonId}
        `
        )
      );
      const lessonStrings = allLessonStrings.filter(lss => lss.length > 0);
      const mtLessonStrings = allLessonStrings.map(lss =>
        lss.filter(ls => ls.motherTongue)
      );

      await Promise.all(
        languages.map(async language => {
          const tStrings = await this.tStrings({
            languageId: language.languageId
          });
          const langProgress: LessonProgress[] = (language.motherTongue
            ? mtLessonStrings
            : lessonStrings
          ).map(lStrings => ({
            lessonId: lStrings[0]?.lessonId || 0,
            progress: percent(
              lStrings.filter(
                lStr =>
                  (language.motherTongue && !lStr.motherTongue) ||
                  findBy(tStrings, "masterId", lStr.masterId)?.text
              ).length,
              lStrings.length
            )
          }));
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
      tStringsByLangId[languageId] = tStrings.map(tStr => tStr.masterId);
    }

    return {
      languages: langsTimestamp > timestamp,
      baseLessons: lessonsTimestamp > timestamp,
      lessons: lessons.map(lsn => lsn.lessonId),
      tStrings: tStringsByLangId,
      timestamp: now
    };
  }

  async close() {
    await this.sql.end();
  }
}

export class PGTestStorage extends PGStorage implements TestPersistence {
  async reset() {
    await pgLoadFixtures(this.sql);
  }

  async writeToDisk() {
    // Later...
  }
}

function dbConnect() {
  const opts: Options = {
    ...secrets.db,
    transform: {
      column: transformCol
    },
    debug: (con, query, params) => {
      // if (
      //   some condition
      // ) {
      //   console.log(`QUERY: ${query}`);
      //   console.log(JSON.stringify(params));
      // }
    }
  };
  return postgres(opts);
}

function transformCol(col: string) {
  const cols = [
    "languageId",
    "motherTongue",
    "lessonId",
    "lessonStringId",
    "masterId",
    "lessonVersion",
    "sourceLanguageId",
    "defaultSrcLang"
  ];
  return cols.find(colName => colName.toLocaleLowerCase() == col) || col;
}
