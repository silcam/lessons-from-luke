import { last, findBy } from "../../core/util/arrayUtils";
import { equal, TString } from "../../core/models/TString";
import { TestPersistence } from "../../core/interfaces/Persistence";
import { fixtures } from "./fixtures";
import { Language, ENGLISH_ID } from "../../core/models/Language";
import { encode } from "../../core/util/timestampEncode";
import { discriminate } from "../../core/util/arrayUtils";
import fs from "fs";

let testDb = fixtures();

const testStorage: TestPersistence = {
  languages: async () => {
    return testDb.languages;
  },

  language: async params => {
    return findBy(testDb.languages, "code", params.code) || null;
  },

  createLanguage: async newLanguage => {
    const languageId = last(testDb.languages).languageId + 1;
    let code = encode();
    while (testDb.languages.find(lng => lng.code == code)) code = encode();
    const lang: Language = { ...newLanguage, languageId, code };
    testDb.languages.push(lang);
    return lang;
  },

  invalidCode: async (code, languageId) => {
    const language = findBy(testDb.languages, "languageId", languageId);
    return !language || language.code !== code;
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

  updateLesson: async (id, version, draftLessonStrings) => {
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

  saveTString: async tString => {
    if (tString.text.length == 0) {
      testDb.tStrings = testDb.tStrings.filter(t => !equal(t, tString));
      return tString;
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
  },

  addOrFindMasterStrings: async texts => {
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
  },

  reset: async () => {
    testDb = fixtures();
  },

  writeToDisk: async () => {
    const filepath = __dirname + "/fixtures-" + new Date().valueOf() + ".json";
    fs.writeFileSync(filepath, JSON.stringify(testDb));
  }
};

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
