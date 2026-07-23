import { NewLanguage, Language } from "../models/Language";
import { Lesson, BaseLesson, DraftLesson } from "../models/Lesson";
import { TString } from "../models/TString";
import { DraftLessonString, LessonString } from "../models/LessonString";
import { ContinuousSyncPackage } from "../models/SyncState";
import { LanguageTimestamp, ArchiveLanguageResult } from "./Api";

export interface Persistence {
  languages: () => Promise<Language[]>;
  language: (params: { code: string } | { languageId: number }) => Promise<Language | null>;
  createLanguage: (lang: NewLanguage) => Promise<Language>;
  updateLanguage: (id: number, update: Partial<Language>) => Promise<Language>;
  // Like updateLanguage, but when `update.defaultSrcLang` is present AND
  // differs from the row's current value, validates the new source is
  // active before applying — rejects with { status: 422 } if missing or
  // archived. Used by the generic update endpoint to enforce FR-006/INV-3.
  updateLanguageChecked: (id: number, update: Partial<Language>) => Promise<Language>;
  archiveLanguage: (languageId: number) => Promise<ArchiveLanguageResult>;
  invalidCode: (code: string, languageIds: number[]) => Promise<boolean>;
  lessons: () => Promise<BaseLesson[]>;
  lesson: (id: number) => Promise<Lesson | null>;
  oldLessonStrings: (lessonId: number, version?: number) => Promise<LessonString[]>;
  createLesson: (lesson: DraftLesson) => Promise<BaseLesson>;
  updateLesson: (
    id: number,
    lessonVersion: number,
    lessonStrings: DraftLessonString[]
  ) => Promise<Lesson>;
  tStrings: (params: {
    languageId: number;
    lessonId?: number;
    masterIds?: number[];
  }) => Promise<TString[]>;
  englishScriptureTStrings: () => Promise<TString[]>;
  addOrFindMasterStrings: (texts: string[]) => Promise<TString[]>;
  saveTStrings: (tStrings: TString[], opts?: { awaitProgress?: boolean }) => Promise<TString[]>;
  sync: (
    timestamp: number,
    languageTimestamps: LanguageTimestamp[]
  ) => Promise<ContinuousSyncPackage>;
}

export interface TestPersistence extends Persistence {
  reset: () => Promise<any>;
  writeToDisk: () => Promise<void>;
  close: () => Promise<void>;
}
