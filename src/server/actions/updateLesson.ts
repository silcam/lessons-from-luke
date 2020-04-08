import { DocString } from "../../core/models/DocString";
import { Persistence } from "../../core/interfaces/Persistence";
import docStorage from "../storage/docStorage";
import mergeXml from "../xml/mergeXml";
import { objKeys } from "../../core/util/objectUtils";
import parse from "../xml/parse";
import { Lesson } from "../../core/models/Lesson";
import webifyLesson from "./webifyLesson";

export default async function updateLesson(
  lessonId: number,
  docStrings: DocString[],
  storage: Persistence
): Promise<Lesson> {
  const lesson = await storage.lesson(lessonId);
  if (!lesson) throw `No lesson found with id ${lessonId}`;
  const newLesson = { ...lesson, version: lesson.version + 1 };

  mergeXml(
    docStorage.docFilepath(lesson),
    docStorage.docFilepath(newLesson),
    docStrings
  );
  const newDocStrings = parseDocStrings(docStorage.docFilepath(newLesson));
  const finalLesson = await saveDocStrings(
    lessonId,
    newLesson.version,
    newDocStrings,
    storage
  );
  webifyLesson(finalLesson);
  return finalLesson;
}

export function parseDocStrings(docFilepath: string) {
  const xmls = docStorage.docXml(docFilepath);
  const docStrings = objKeys(xmls).reduce(
    (docStrings: DocString[], xmlType) =>
      docStrings.concat(parse(xmls[xmlType], xmlType)),
    []
  );
  return docStrings;
}

export async function saveDocStrings(
  lessonId: number,
  lessonVersion: number,
  docStrings: DocString[],
  storage: Persistence
): Promise<Lesson> {
  const tStrings = await storage.addOrFindMasterStrings(
    docStrings.map(str => str.text)
  );
  const draftLessonStrings = docStrings.map((docString, index) => ({
    masterId: tStrings[index].masterId,
    lessonId,
    type: docString.type,
    xpath: docString.xpath,
    motherTongue: docString.motherTongue
  }));
  const lesson = await storage.updateLesson(
    lessonId,
    lessonVersion,
    draftLessonStrings
  );
  return lesson;
}
