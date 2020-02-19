export type LessonStringType = "content" | "styles" | "meta";

export interface LessonString {
  lessonStringId: number;
  masterId: number;
  lessonId: number;
  lessonVersion: number;
  type: LessonStringType;
  xpath: string;
  motherTongue: boolean;
}
