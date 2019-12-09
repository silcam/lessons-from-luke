import { LessonVersion } from "./LessonVersion";
import { validateFields, Fields } from "../util/objectUtils";

export interface BasicLanguageLesson {
  languageId: number;
  lessonVersionId: number;
}

export interface NewLanguageLesson {
  languageId: number;
  lessonId: number;
}

export type LanguageLesson = BasicLanguageLesson & LessonVersion;

export function isNewLanguageLesson(params: any): params is NewLanguageLesson {
  const fields: Fields<NewLanguageLesson> = [
    ["languageId", "number"],
    ["lessonId", "number"]
  ];
  return validateFields(params, fields);
}
