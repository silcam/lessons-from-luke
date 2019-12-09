import { Lesson } from "./Lesson";

export interface BasicLessonVersion {
  lessonVersionId: number;
  lessonId: number;
  version: number;
}

export type LessonVersion = Lesson & BasicLessonVersion;
