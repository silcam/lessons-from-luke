import { NewLanguage, Language } from "../models/Language";
import { Lesson, BaseLesson } from "../models/Lesson";
import { TString, LessonTString } from "../models/TString";

export interface Persistence {
  languages: () => Promise<Language[]>;
  language: (params: { code: string }) => Promise<Language | null>;
  createLanguage: (lang: NewLanguage) => Promise<Language>;
  invalidCode: (code: string, languageId: number) => Promise<boolean>;
  lessons: () => Promise<BaseLesson[]>;
  lesson: (id: number) => Promise<Lesson | null>;
  tStrings: (params: {
    languageId: number;
    lessonId?: number;
  }) => Promise<TString[]>;

  saveTString: (tStr: TString) => Promise<TString>;
  reset: () => Promise<void>;
}
