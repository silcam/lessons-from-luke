import { NewLanguage, Language } from "../models/Language";
import { Lesson, BaseLesson, DraftLesson } from "../models/Lesson";
import { TString } from "../models/TString";
import { DraftLessonString } from "../models/LessonString";

export interface Persistence {
  languages: () => Promise<Language[]>;
  language: (
    params: { code: string } | { languageId: number }
  ) => Promise<Language | null>;
  createLanguage: (lang: NewLanguage) => Promise<Language>;
  updateLanguage: (id: number, update: Partial<Language>) => Promise<Language>;
  invalidCode: (code: string, languageIds: number[]) => Promise<boolean>;
  lessons: () => Promise<BaseLesson[]>;
  lesson: (id: number) => Promise<Lesson | null>;
  createLesson: (lesson: DraftLesson) => Promise<BaseLesson>;
  updateLesson: (
    id: number,
    lessonVersion: number,
    lessonStrings: DraftLessonString[]
  ) => Promise<Lesson>;
  tStrings: (params: {
    languageId: number;
    lessonId?: number;
  }) => Promise<TString[]>;
  englishScriptureTStrings: () => Promise<TString[]>;
  addOrFindMasterStrings: (texts: string[]) => Promise<TString[]>;
  saveTStrings: (
    tStrings: TString[],
    opts?: { awaitProgress?: boolean }
  ) => Promise<TString[]>;
}

export interface TestPersistence extends Persistence {
  reset: () => Promise<any>;
  writeToDisk: () => Promise<void>;
  close: () => Promise<void>;
}
