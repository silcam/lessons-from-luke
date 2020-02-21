import { Book } from "./Lesson";
import { ENGLISH_ID } from "./Language";

export interface EnglishUploadMeta {
  languageId: number;
  book: Book;
  series: number;
  lesson: number;
}

export function defaultEnglishUploadMeta(): EnglishUploadMeta {
  return {
    languageId: ENGLISH_ID,
    book: "Luke",
    series: 1,
    lesson: 1
  };
}

export interface OtherUploadMeta {
  languageId: number;
  lessonId: number;
}

export function isEnglishUpload(
  meta: DocUploadMeta
): meta is EnglishUploadMeta {
  return meta.languageId === ENGLISH_ID;
}

export type DocUploadMeta = EnglishUploadMeta | OtherUploadMeta;
