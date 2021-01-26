import { last, findBy, findByStrict } from "../../core/util/arrayUtils";
import { equal, TString } from "../../core/models/TString";
import { TestPersistence } from "../../core/interfaces/Persistence";
import { fixtures } from "./fixtures";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { encode } from "../../core/util/timestampEncode";
import { discriminate } from "../../core/util/arrayUtils";
import { percent } from "../../core/util/numberUtils";
import fs from "fs";
import { LessonProgress } from "../../core/models/Language";
import { VerseStringPattern } from "../usfm/translateFromUsfm";
import { LanguageTimestamp } from "../../core/interfaces/Api";

let testDb = fixtures();
updateProgress(); // We could await this if it seemed necessary

const testStorage: TestPersistence = {
  languages: async () => {
    return testDb.languages;
  },

  language: async params => {
    return (
      ("code" in params
        ? findBy(testDb.languages, "code", params.code)
        : findBy(testDb.languages, "languageId", params.languageId)) || null
    );
  },

  createLanguage: async newLanguage => {
    const languageId = last(testDb.languages).languageId + 1;
    let code = encode();
    while (testDb.languages.find(lng => lng.code == code)) code = encode();
    const lang: Language = {
      ...newLanguage,
      languageId,
      code,
      motherTongue: true,
      progress: []
    };
    testDb.languages.push(lang);
    return lang;
  },

  updateLanguage: async (languageId, update) => {
    const language = findByStrict(testDb.languages, "languageId", languageId);
    Object.assign(language, update);
    await updateProgress();
    return findByStrict(testDb.languages, "languageId", languageId);
  },

  invalidCode: async (code, languageIds) => {
    const language = findBy(testDb.languages, "code", code);
    if (!language) return true;
    return !languageIds.every(id => id == language.languageId);
  },

  lessons: async () => {
    return testDb.lessons;
  },

  lesson: async id => {
    const lesson = findBy(testDb.lessons, "lessonId", id);
    if (!lesson) return null;

    return {
      ...lesson,
      lessonStrings: testDb.lessonStrings.filter(ls => ls.lessonId == id)
    };
  },

  createLesson: async lesson => {
    const lessonId = last(testDb.lessons).lessonId + 1;
    const newLesson = { ...lesson, lessonId, version: 0 };
    testDb.lessons.push(newLesson);
    return newLesson;
  },

  updateLesson: async (id, version, draftLessonStrings) =>
    withProgressUpdate(async () => {
      const lesson = findBy(testDb.lessons, "lessonId", id);
      if (!lesson) throw `Lesson with id ${id} not found!`;
      lesson.version = version;

      let nextLessonStringId = last(testDb.lessonStrings).lessonStringId + 1;
      const newLessonStrings = draftLessonStrings.map(str => {
        const lessonStr = {
          ...str,
          lessonStringId: nextLessonStringId,
          lessonVersion: lesson.version
        };
        nextLessonStringId += 1;
        return lessonStr;
      });

      const [lessonStringsToRemve, lessonStringsToKeep] = discriminate(
        testDb.lessonStrings,
        lStr => lStr.lessonId == id
      );
      testDb.oldLessonStrings = testDb.oldLessonStrings.concat(
        lessonStringsToRemve
      );
      testDb.lessonStrings = lessonStringsToKeep.concat(newLessonStrings);

      return { ...lesson, lessonStrings: newLessonStrings };
    }),

  lessonDiffs: async () => [],

  updateLessonDiff: async () => {},

  oldLessonStrings: async (lessonId, version?) => {
    // Placeholder
    return [];
  },

  tStrings: async params => {
    const langTStrings = testDb.tStrings.filter(
      ts => ts.languageId == params.languageId
    );
    if (!params.lessonId) return langTStrings;
    const masterIds = testDb.lessonStrings
      .filter(ls => ls.lessonId == params.lessonId)
      .map(ls => ls.masterId);
    return langTStrings.filter(ts => masterIds.includes(ts.masterId));
  },

  englishScriptureTStrings: async () => {
    return testDb.tStrings.filter(
      tStr =>
        tStr.languageId == ENGLISH_ID && VerseStringPattern.test(tStr.text)
    );
  },

  saveTStrings: async (tStrings, opts = {}) => {
    const newTStrings = tStrings.map(tString => {
      if (tString.text.length == 0) {
        testDb.tStrings = testDb.tStrings.filter(t => !equal(t, tString));
        return null;
      }
      const existing = testDb.tStrings.find(t => equal(t, tString));
      if (existing) {
        if (existing.text !== tString.text)
          tString.history = [...existing.history, existing.text];
        Object.assign(existing, tString);
        return existing;
      } else {
        testDb.tStrings.push(tString);
        return tString;
      }
    });
    if (opts.awaitProgress) await updateProgress();
    else updateProgress();
    return newTStrings.filter(tStr => tStr) as TString[];
  },

  addOrFindMasterStrings: async texts =>
    withProgressUpdate(async () => {
      // This `map` has a side effect - just to prove that we're not functional purists ;)
      return texts.map(text => {
        const existing = testDb.tStrings.find(
          tStr => tStr.languageId == ENGLISH_ID && tStr.text == text
        );
        if (existing) return existing;

        const newTStr: TString = {
          masterId: last(testDb.tStrings).masterId + 1,
          languageId: ENGLISH_ID,
          text,
          history: []
        };
        testDb.tStrings.push(newTStr);
        return newTStr;
      });
    }),

  reset: async () => {
    testDb = fixtures();
    updateProgress(); // We could await this if it seemed necessary
  },

  writeToDisk: async () => {
    const filepath = __dirname + "/fixtures-" + new Date().valueOf() + ".json";
    fs.writeFileSync(filepath, JSON.stringify(testDb));
  },

  sync: async (timestamp: number, ids: LanguageTimestamp[]) => {
    // Stubbed response for compiler
    return {
      languages: false,
      baseLessons: false,
      lessons: [],
      tStrings: {},
      timestamp: Date.now()
    };
  },

  close: async () => {}
};

async function withProgressUpdate<T>(cb: () => Promise<T>) {
  const val = await cb();
  updateProgress();
  return val;
}

async function updateProgress() {
  testDb.languages.forEach(language => {
    const newProgress: LessonProgress[] = [];
    const tStrings = testDb.tStrings.filter(
      tStr => tStr.languageId == language.languageId
    );
    testDb.lessons.forEach(lesson => {
      const lessonStrings = testDb.lessonStrings.filter(
        lStr =>
          lStr.lessonId == lesson.lessonId &&
          (!language.motherTongue || lStr.motherTongue)
      );
      const progress = percent(
        lessonStrings.filter(lStr =>
          tStrings.find(tStr => tStr.masterId == lStr.masterId)
        ).length,
        lessonStrings.length
      );
      newProgress.push({
        lessonId: lesson.lessonId,
        progress
      });
    });
    language.progress = newProgress;
  });
}

function join<A, B>(
  alist: A[],
  blist: B[],
  match: (a: A, b: B) => boolean
): (A & B)[] {
  return alist.reduce(
    (jlist, aitem) =>
      jlist.concat(
        blist
          .filter(bitem => match(aitem, bitem))
          .map(bitem => ({ ...bitem, ...aitem }))
      ),
    [] as (A & B)[]
  );
}

function outerJoin<A, B>(
  alist: A[],
  blist: B[],
  match: (a: A, b: B) => boolean
): (A & Partial<B>)[] {
  return alist.reduce((jlist, aitem) => {
    const matches = blist
      .filter(bitem => match(aitem, bitem))
      .map(bitem => ({ ...bitem, ...aitem }));
    return jlist.concat(matches.length > 0 ? matches : [aitem]);
  }, [] as (A & Partial<B>)[]);
}

export default testStorage;
