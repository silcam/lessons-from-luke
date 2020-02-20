import { LessonStringType } from "./LessonString";

export interface DocString {
  type: LessonStringType;
  xpath: string;
  motherTongue: boolean;
  text: string;
}
