import { NewLanguage, Language } from "../models/Language";
import { Lesson, BaseLesson, DraftLesson } from "../models/Lesson";
import { TString } from "../models/TString";
import { DraftLessonString } from "../models/LessonString";

export interface Persistence {
  languages: () => Promise<Language[]>;
  language: (params: { code: string }) => Promise<Language | null>;
  createLanguage: (lang: NewLanguage) => Promise<Language>;
  invalidCode: (code: string, languageId: number) => Promise<boolean>;
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
  addOrFindMasterStrings: (texts: string[]) => Promise<TString[]>;
  saveTString: (tStr: TString) => Promise<TString>;
}

export interface TestPersistence extends Persistence {
  reset: () => Promise<void>;
  writeToDisk: () => Promise<void>;
}
