import { User, LoginAttempt } from "../models/User";
import { TString } from "../models/TString";
import { Language, NewLanguage, PublicLanguage } from "../models/Language";
import { BaseLesson, Lesson } from "../models/Lesson";
import { DocString } from "../models/DocString";

export type Params = { [key: string]: string | number };

export interface APIGet {
  "/api/users/current": [{}, User | null];
  "/api/languages": [{}, PublicLanguage[]];
  "/api/admin/languages": [{}, Language[]];
  "/api/languages/:languageId/tStrings": [{ languageId: number }, TString[]];
  "/api/languages/code/:code": [{ code: string }, Language | null];
  "/api/languages/:languageId/lessons/:lessonId/tStrings": [
    { lessonId: number; languageId: number },
    TString[]
  ];
  "/api/lessons": [{}, BaseLesson[]];
  "/api/lessons/:lessonId": [{ lessonId: number }, Lesson];
}

export interface APIPost {
  "/api/users/login": [{}, LoginAttempt, User | null];
  "/api/users/logout": [{}, null, null];
  "/api/admin/languages": [{}, NewLanguage, Language];
  "/api/admin/languages/:languageId": [
    { languageId: number },
    { motherTongue: boolean },
    Language
  ];
  "/api/admin/languages/:languageId/usfm": [
    { languageId: number },
    { usfm: string },
    { language: Language; tStrings: TString[]; errors: string[] }
  ];
  "/api/tStrings": [{}, { code: string; tStrings: TString[] }, TString[]];
  "/api/admin/lessons/:lessonId/strings": [
    { lessonId: number },
    DocString[],
    { lesson: Lesson; tStrings: TString[] }
  ];
}

export type GetRoute = keyof APIGet;
export type PostRoute = keyof APIPost;
