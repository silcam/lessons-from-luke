import { User, LoginAttempt } from "../models/User";
import { TString } from "../models/TString";
import {
  Language,
  NewLanguage,
  PublicLanguage,
  LessonProgress
} from "../models/Language";
import { BaseLesson, Lesson } from "../models/Lesson";
import { DocString } from "../models/DocString";
import { SyncState } from "../models/SyncState";
import { Locale } from "../i18n/I18n";

export type Params = { [key: string]: string | number };

export interface APIGet {
  // Both
  "/api/languages": [{}, PublicLanguage[]];
  "/api/languages/code/:code": [{ code: string }, Language | null];
  "/api/languages/:languageId/lessons/:lessonId/tStrings": [
    { lessonId: number; languageId: number },
    TString[]
  ];
  "/api/lessons": [{}, BaseLesson[]];
  "/api/lessons/:lessonId": [{ lessonId: number }, Lesson];
  "/api/lessons/:lessonId/webified": [{ lessonId: number }, { html: string }];

  // Web Only
  "/api/users/current": [{}, User | null];
  "/api/admin/languages": [{}, Language[]];
  "/api/languages/:languageId/tStrings": [{ languageId: number }, TString[]];

  // Desktop Only
  "/api/syncState": [{}, SyncState];
}

export interface APIPost {
  //Both
  "/api/tStrings": [{}, { code: string; tStrings: TString[] }, TString[]];

  // Web Only
  "/api/users/login": [{}, LoginAttempt, User | null];
  "/api/users/logout": [{}, null, null];
  "/api/admin/languages": [{}, NewLanguage, Language];
  "/api/admin/languages/:languageId": [
    { languageId: number },
    { motherTongue?: boolean; defaultSrcLang?: number },
    Language
  ];
  "/api/admin/languages/:languageId/usfm": [
    { languageId: number },
    { usfm: string },
    { language: Language; tStrings: TString[]; errors: string[] }
  ];
  "/api/admin/lessons/:lessonId/strings": [
    { lessonId: number },
    DocString[],
    { lesson: Lesson; tStrings: TString[] }
  ];

  // Desktop Only
  "/api/syncState/code": [{}, { code: string }, SyncState];
  "/api/syncState/locale": [{}, { locale: Locale }, SyncState];
  "/api/syncState/progress": [{}, LessonProgress, void];
}

export type GetRoute = keyof APIGet;
export type PostRoute = keyof APIPost;
