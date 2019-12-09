export type LessonStringType = "content" | "styles" | "meta";

export interface LessonString {
  lessonStringId: number;
  masterId: number;
  lessonVersionId: number;
  type: LessonStringType;
  xpath: string;
  motherTongue: boolean;
}
