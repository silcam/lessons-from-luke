import { User, LoginAttempt } from "../models/User";
import { TString } from "../models/TString";
import { Language, NewLanguage, PublicLanguage, LessonProgress } from "../models/Language";
import { BaseLesson, Lesson } from "../models/Lesson";
import { DocString } from "../models/DocString";
import { SyncState, ContinuousSyncPackage } from "../models/SyncState";
import { Locale } from "../i18n/I18n";
import { TSub } from "../models/TSub";

export type Params = { [key: string]: string | number };

export interface APIGet {
  // Both
  "/api/languages": [Record<string, never>, PublicLanguage[]];
  "/api/languages/code/:code": [{ code: string }, Language | null];
  "/api/languages/:languageId/lessons/:lessonId/tStrings": [
    { lessonId: number; languageId: number },
    TString[],
  ];
  "/api/lessons": [Record<string, never>, BaseLesson[]];
  "/api/lessons/:lessonId": [{ lessonId: number }, Lesson];
  "/api/lessons/:lessonId/webified": [{ lessonId: number }, { html: string }];

  // Web Only
  "/api/auth/get-session": [Record<string, never>, { user: User } | null];
  "/api/users/current": [Record<string, never>, User | null];
  "/api/admin/languages": [Record<string, never>, Language[]];
  "/api/languages/:languageId/tStrings": [{ languageId: number }, TString[]];
  "/api/languages/:languageId/tStrings/:ids": [{ languageId: number; ids: string }, TString[]];
  "/api/sync/:timestamp/languages/:languageTimestamps?": [
    { timestamp: number; languageTimestamps: string },
    ContinuousSyncPackage,
  ];
  "/api/admin/lessons/:lessonId/lessonUpdateIssues": [{ lessonId: number }, TSub[]];

  // Desktop Only
  "/api/syncState": [Record<string, never>, SyncState];
  "/api/readyToTranslate": [Record<string, never>, { readyToTranslate: boolean }];
}

export interface APIPost {
  //Both
  "/api/tStrings": [Record<string, never>, { code: string; tStrings: TString[] }, TString[]];

  // Web Only
  "/api/users/login": [Record<string, never>, LoginAttempt, User | null];
  "/api/users/logout": [Record<string, never>, null, null];
  "/api/admin/languages": [Record<string, never>, NewLanguage, Language];
  "/api/admin/languages/:languageId": [
    { languageId: number },
    { motherTongue?: boolean; defaultSrcLang?: number },
    Language,
  ];
  "/api/admin/languages/:languageId/usfm": [
    { languageId: number },
    { usfm: string },
    { language: Language; tStrings: TString[]; errors: string[] },
  ];
  "/api/admin/lessons/:lessonId/strings": [
    { lessonId: number },
    DocString[],
    { lesson: Lesson; tStrings: TString[] },
  ];

  // Desktop Only
  "/api/syncState/code": [Record<string, never>, { code: string }, SyncState];
  "/api/syncState/locale": [Record<string, never>, { locale: Locale }, SyncState];
  "/api/syncState/progress": [Record<string, never>, LessonProgress, void];
}

export type GetRoute = keyof APIGet;
export type PostRoute = keyof APIPost;

export interface LanguageTimestamp {
  languageId: number;
  timestamp: number;
}

export function encodeLanguageTimestamps(langTimestamps: LanguageTimestamp[]): string {
  return langTimestamps.map((lt) => `${lt.languageId}-${lt.timestamp}`).join(",");
}

export function decodeLanguageTimestamps(encoded: string): LanguageTimestamp[] {
  if (encoded.length == 0) return [];
  return encoded.split(",").map((langStamp) => {
    const [languageId, timestamp] = langStamp.split("-").map((num) => parseInt(num));
    if (!languageId || !timestamp) throw { status: 400 };
    return { languageId, timestamp };
  });
}
