import { User, LoginAttempt } from "../models/User";
import { TString } from "../models/TString";
import {
  Language,
  NewLanguage,
  WithCode,
  PublicLanguage
} from "../models/Language";
import { Lesson } from "../models/Lesson";
import { LanguageLesson, BasicLanguageLesson } from "../models/LanguageLesson";
import { LessonString } from "../models/LessonString";
import { LessonVersion } from "../models/LessonVersion";

export type Params = { [key: string]: string | number };

export interface APIGet {
  "/api/users/current": [{}, User | null];
  "/api/languages": [{}, PublicLanguage[]];
  "/api/admin/languages": [{}, Language[]];
  "/api/languages/:languageId/tStrings": [{ languageId: number }, TString[]];
  "/api/languages/code/:code": [{ code: string }, Language | null];
  "/api/languages/:languageId/lessonVersions/:lessonVersionId/tStrings": [
    { lessonVersionId: number; languageId: number },
    TString[]
  ];
  "/api/languages/:languageId/lessonVersions": [
    { languageId: number },
    LanguageLesson[]
  ];
  "/api/languages/:languageId/lessonStrings": [
    { languageId: number },
    LessonString[]
  ];
  "/api/lessons": [{}, Lesson[]];
  "/api/lessonVersions/:lessonVersionId/lessonStrings": [
    { lessonVersionId: number },
    LessonString[]
  ];
}

export interface APIPost {
  "/api/users/login": [{}, LoginAttempt, User | null];
  "/api/users/logout": [{}, null, null];
  "/api/admin/languages": [{}, NewLanguage, Language];
  "/api/languageLessons": [{}, WithCode<BasicLanguageLesson>, LessonVersion[]];
  "/api/tStrings": [{}, WithCode<TString>, TString];
}

export type GetRoute = keyof APIGet;
export type PostRoute = keyof APIPost;
