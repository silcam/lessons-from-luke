import { Fields, validateFields } from "../util/objectUtils";
import { findBy } from "../util/arrayUtils";
import { average } from "../util/numberUtils";

export const ENGLISH_ID = 1;

export interface Language {
  languageId: number;
  name: string;
  code: string;
  motherTongue: boolean;
  progress: LessonProgress[];
}

export type PublicLanguage = Omit<Language, "code">;
export type NewLanguage = { name: string };
export type MaybePublicLanguage = Language | PublicLanguage;

export type WithCode<T> = T & { code: string };

export function isLanguage(language: any): language is Language {
  const fields: Fields<Language> = [
    ["name", "string"],
    ["code", "string"],
    ["languageId", "number"]
  ];
  return validateFields(language, fields);
}

export function isNewLanguage(language: any): language is NewLanguage {
  const fields: Fields<Language> = [["name", "string"]];
  return validateFields(language, fields);
}

export function languageCompare(a: PublicLanguage, b: PublicLanguage) {
  return a.name.localeCompare(b.name);
}

export function isWithCode<T>(
  item: any,
  isT: (t: any) => t is T
): item is WithCode<T> {
  return validateFields(item, [["code", "string"]]) && isT(item);
}

export interface LessonProgress {
  lessonId: number;
  progress: number;
}

export function lessonProgress(
  progress: LessonProgress[],
  lessonId: number
): number {
  return findBy(progress, "lessonId", lessonId)?.progress || 0;
}

export function totalProgress(progress: LessonProgress[]) {
  return Math.round(average(progress.map(p => p.progress)));
}

export function sqlizeLang(lang: Language) {
  return { ...lang, progress: JSON.stringify(lang.progress) };
}
