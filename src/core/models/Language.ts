import { Fields, validateFields } from "../util/objectUtils";
import { findBy } from "../util/arrayUtils";
import { average, percent } from "../util/numberUtils";
import { LessonString } from "./LessonString";
import { TString } from "./TString";

export const ENGLISH_ID = 1;
export const FRENCH_ID = 2;
export const MAX_LANGUAGE_NAME_LENGTH = 100;

// eslint-disable-next-line no-control-regex
const C0_C1_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
const PATH_TRAVERSAL_CHARS = /[/\\]|\.\./;

export type LanguageNameError = "empty" | "tooLong" | "invalid";

/**
 * Classifies why a candidate language name is invalid, or returns undefined
 * if the (trimmed) name is valid. Single source of truth for the
 * trim/empty/length/control-char/path-traversal rules shared by the server's
 * validation and the frontend's inline error messages.
 */
export function describeLanguageNameError(name: unknown): LanguageNameError | undefined {
  if (typeof name !== "string") return "empty";
  const trimmed = name.trim();
  if (trimmed.length === 0) return "empty";
  if (trimmed.length > MAX_LANGUAGE_NAME_LENGTH) return "tooLong";
  if (C0_C1_CONTROL_CHARS.test(trimmed)) return "invalid";
  if (PATH_TRAVERSAL_CHARS.test(trimmed)) return "invalid";
  return undefined;
}

export interface Language {
  languageId: number;
  name: string;
  code: string;
  motherTongue: boolean;
  progress: LessonProgress[];
  defaultSrcLang: number;
  archived: boolean;
}

export type PublicLanguage = Omit<Language, "code">;
export type NewLanguage = { name: string; defaultSrcLang: number };
export type MaybePublicLanguage = Language | PublicLanguage;

export type WithCode<T> = T & { code: string };

export function isLanguage(language: any): language is Language {
  const fields: Fields<Language> = [
    ["name", "string"],
    ["code", "string"],
    ["languageId", "number"],
  ];
  return validateFields(language, fields);
}

export function isNewLanguage(language: any): language is NewLanguage {
  const fields: Fields<Language> = [
    ["name", "string"],
    ["defaultSrcLang", "number"],
  ];
  return validateFields(language, fields);
}

export function languageCompare(a: PublicLanguage, b: PublicLanguage) {
  return a.name.localeCompare(b.name);
}

export function isWithCode<T>(item: any, isT: (t: any) => t is T): item is WithCode<T> {
  return validateFields(item, [["code", "string"]]) && isT(item);
}

export interface LessonProgress {
  lessonId: number;
  progress: number;
}

export function lessonProgress(progress: LessonProgress[], lessonId: number): number {
  return findBy(progress, "lessonId", lessonId)?.progress || 0;
}

export function totalProgress(progress: LessonProgress[]) {
  return Math.round(average(progress.map((p) => p.progress)));
}

export function calcLessonProgress(
  motherTongue: boolean,
  lessonStrings: LessonString[],
  tStrings: TString[]
): LessonProgress {
  if (lessonStrings.length == 0) return { lessonId: 0, progress: 0 };

  lessonStrings = motherTongue ? lessonStrings.filter((lStr) => lStr.motherTongue) : lessonStrings;
  return {
    lessonId: lessonStrings[0].lessonId,
    progress: percent(
      lessonStrings.filter((lStr) => findBy(tStrings, "masterId", lStr.masterId)?.text).length,
      lessonStrings.length
    ),
  };
}

export function sqlizeLang(lang: Language) {
  return { ...lang, progress: JSON.stringify(lang.progress) };
}
