import { NewLanguage, Language } from "../models/Language";
import { Lesson } from "../models/Lesson";
import {
  NewLanguageLesson,
  BasicLanguageLesson,
  LanguageLesson
} from "../models/LanguageLesson";
import { LessonString } from "../models/LessonString";
import { TString, LessonTString } from "../models/TString";
import { LessonVersion } from "../models/LessonVersion";

export interface Persistence {
  languages: () => Promise<Language[]>;
  language: (params: { code: string }) => Promise<Language | null>;
  createLanguage: (lang: NewLanguage) => Promise<Language>;
  invalidCode: (code: string, languageId: number) => Promise<boolean>;
  lessons: () => Promise<Lesson[]>;
  lessonVersions: (languageId: number) => Promise<LanguageLesson[]>;
  createLanguageLesson: (
    newLanguageLesson: NewLanguageLesson
  ) => Promise<BasicLanguageLesson>;
  lessonStrings: (
    params: { languageId: number } | { lessonVersionId: number }
  ) => Promise<LessonString[]>;
  tStrings: (params: {
    languageId: number;
    lessonVersionId?: number;
  }) => Promise<TString[]>;
  saveTString: (tStr: TString) => Promise<TString>;
  reset: () => Promise<void>;
}
