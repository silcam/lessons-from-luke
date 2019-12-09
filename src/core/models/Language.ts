import { Fields, validateFields } from "../util/objectUtils";

export interface Language {
  languageId: number;
  name: string;
  code: string;
}

export type PublicLanguage = Omit<Language, "code">;
export type NewLanguage = Omit<PublicLanguage, "languageId">;
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
