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

// For creating a single-language document for a lesson
// It needs to strip majority language strings when there are corresponding mother language strings
// This algorithm works by moving through the strings keeping track of the idSuppressQueue
// Any found mother tongue strings put their master id in the queue
// When a corresponding majority language string is found, that id is removed from the queue along with any
// other ids before it in the queue (Some may not have matches due to inconsistency in the doc; this
// approach keeps them from matching further down than they should)
// Matched majority language strings have their text replaced with "" in the docstrings
export function singleLanguageize(
  lessonStrings: LessonString[],
  docStrings: DocString[]
) {
  const idSuppressQueue: number[] = [];
  return docStrings.map((docString, i) => {
    const lessonString = lessonStrings[i];
    if (lessonString.motherTongue) {
      idSuppressQueue.push(lessonString.masterId);
      return docString;
    }

    if (idSuppressQueue.includes(lessonString.masterId)) {
      idSuppressQueue.splice(
        0,
        idSuppressQueue.indexOf(lessonString.masterId) + 1
      );
      return { ...docString, text: "" };
    }

    return docString;
  });
}

export function makeWebifyDocStrings(
  lessonStrings: LessonString[]
): DocString[] {
  return lessonStrings.map(lsnStr => ({
    type: lsnStr.type,
    xpath: lsnStr.xpath,
    motherTongue: lsnStr.motherTongue,
    text: `##${lsnStr.lessonStringId}##`
  }));
}
