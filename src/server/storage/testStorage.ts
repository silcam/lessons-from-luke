import { last, findBy } from "../../core/util/arrayUtils";
import { TString, equal } from "../../core/models/TString";
import { Persistence } from "../../core/interfaces/Persistence";
import { fixtures } from "./fixtures";
import { Language } from "../../core/models/Language";
import { BasicLanguageLesson } from "../../core/models/LanguageLesson";
import { encode } from "../../core/util/timestampEncode";

let testDb = fixtures();

const testStorage: Persistence = {
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

  lessonVersions: async languageId => {
    const langLessonVersions = join(
      testDb.languageLessons.filter(item => item.languageId === languageId),
      testDb.lessonVersions,
      (ll, lv) => ll.lessonVersionId === lv.lessonVersionId
    );
    return join(
      langLessonVersions,
      testDb.lessons,
      (llb, l) => llb.lessonId === l.lessonId
    );
  },

  createLanguageLesson: async newLanguageLesson => {
    const lessonVersion = last(
      testDb.lessonVersions.filter(
        lv => lv.lessonId == newLanguageLesson.lessonId
      )
    );
    if (!lessonVersion) throw { message: "Invalid lesson id.", type: "TestDB" };
    const languageLesson: BasicLanguageLesson = {
      languageId: newLanguageLesson.languageId,
      lessonVersionId: lessonVersion.lessonVersionId
    };
    testDb.languageLessons.push(languageLesson);
    return languageLesson;
  },

  lessonStrings: async function(params) {
    if ("lessonVersionId" in params) {
      return testDb.lessonStrings.filter(
        ls => ls.lessonVersionId == params.lessonVersionId
      );
    } else {
      const langLessonVersions = (
        await this.lessonVersions(params.languageId)
      ).map(lv => ({ lessonVersionId: lv.lessonVersionId }));
      return join(
        testDb.lessonStrings,
        langLessonVersions,
        (ls, llv) => ls.lessonVersionId == llv.lessonVersionId
      );
    }
  },

  tStrings: async params => {
    const langTStrings = testDb.tStrings.filter(
      ts => ts.languageId == params.languageId
    );
    if (!params.lessonVersionId) return langTStrings;
    const masterIds = testDb.lessonStrings
      .filter(ls => ls.lessonVersionId == params.lessonVersionId)
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

  reset: async () => {
    testDb = fixtures();
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
