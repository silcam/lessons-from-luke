import { LessonString } from "./LessonString";
import { Fields, validateFields } from "../util/objectUtils";

export interface TString {
  masterId: number;
  languageId: number;
  sourceLanguageId?: number;
  source?: string;
  text: string;
  history: string[];
  lessonStringId?: number;
}

export function equal(a: TString, b: TString) {
  return (
    a.masterId === b.masterId &&
    a.languageId === b.languageId &&
    a.lessonStringId === b.lessonStringId
  );
}

export function isTString(t: TString): t is TString {
  const fields: Fields<TString> = [
    ["masterId", "number"],
    ["languageId", "number"],
    ["text", "string"],
    ["history", "string[]"]
  ];
  return validateFields(t, fields);
}

export type LessonTString = LessonString & Partial<TString>;
