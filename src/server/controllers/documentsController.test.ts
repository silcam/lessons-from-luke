import { loggedInAgent, resetStorage } from "../testHelper";
import { ENGLISH_ID } from "../../core/models/Language";
import { last } from "../../core/util/arrayUtils";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { unlinkSafe } from "../../core/util/fsUtils";

beforeEach(() => {
  return resetStorage();
});

afterAll(() => {
  unlinkSafe("test/docs/serverDocs/Luke-1-06v01.odt");
});

test("Upload new English Lesson", async () => {
  expect.assertions(5);
  const agent = await loggedInAgent();
  let response = await agent
    .post("/api/admin/documents")
    .field("languageId", ENGLISH_ID)
    .field("book", "Luke")
    .field("series", 1)
    .field("lesson", 6)
    .attach("document", "test/docs/English_Luke-Q1-L06.odt");
  expect(response.status).toBe(200);
  expect(response.body.lesson).toMatchObject({
    lessonId: 16,
    version: 1,
    book: "Luke",
    series: 1,
    lesson: 6
  });
  expect(response.body.lesson.lessonStrings[2]).toEqual({
    lessonId: 16,
    lessonStringId: 1406,
    lessonVersion: 1,
    type: "content",
    motherTongue: true,
    masterId: 656,
    xpath:
      "/office:document-content/office:body/office:text/table:table/table:table-row/table:table-cell[2]/text:p[1]/text()"
  });
  expect(last(response.body.tStrings)).toEqual({
    history: [],
    languageId: 1,
    masterId: 736,
    text: "Review: Lessons 1-5"
  });
  expect(
    response.body.lesson.lessonStrings.filter(
      (lStr: LessonString) =>
        !response.body.tStrings.some(
          (tStr: TString) => tStr.masterId == lStr.masterId
        )
    )
  ).toEqual([]);
});

test("Upload French version", async () => {
  expect.assertions(5);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/documents")
    .field("languageId", 2)
    .field("lessonId", 11)
    .attach("document", "test/docs/Français_Luke-T1-L01.odt");
  expect(response.status).toBe(200);
  expect(response.body.docStrings[1]).toEqual({
    motherTongue: true,
    text: "Le livre de Luc et la naissance de Jean Baptiste",
    type: "content",
    xpath:
      "/office:document-content/office:body/office:text/table:table[1]/table:table-row/table:table-cell[2]/text:p[1]/text()"
  });
  expect(response.body.lesson).toMatchObject({ lessonId: 11 });
  expect(response.body.lesson.lessonStrings[0]).toMatchObject({
    lessonStringId: 7
  });
  expect(response.body.tStrings[0]).toMatchObject({
    masterId: 1,
    languageId: 1
  });
});
