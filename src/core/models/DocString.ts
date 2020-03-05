import { LessonStringType, LessonString } from "./LessonString";
import { TString } from "./TString";
import { findBy } from "../util/arrayUtils";

export interface DocString {
  type: LessonStringType;
  xpath: string;
  motherTongue: boolean;
  text: string;
}

export function makeDocStrings(
  lessonStrings: LessonString[],
  mtTStrings: TString[],
  otherTStrings: TString[]
): DocString[] {
  return lessonStrings.map(lsnStr => ({
    type: lsnStr.type,
    xpath: lsnStr.xpath,
    motherTongue: lsnStr.motherTongue,
    text:
      findBy(
        lsnStr.motherTongue ? mtTStrings : otherTStrings,
        "masterId",
        lsnStr.masterId
      )?.text || ""
  }));
}
