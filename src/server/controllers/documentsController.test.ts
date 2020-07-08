/// <reference types="jest" />

import {
  loggedInAgent,
  resetStorage,
  closeStorage,
  plainAgent
} from "../testHelper";
import { ENGLISH_ID } from "../../core/models/Language";
import { last, findBy } from "../../core/util/arrayUtils";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { unlinkSafe } from "../../core/util/fsUtils";

afterAll(async () => {
  unlinkSafe("test/docs/serverDocs/Luke-1-06v01.odt");
  await closeStorage();
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
    .attach("document", "cypress/fixtures/English_Luke-Q1-L06.odt");
  expect(response.status).toBe(200);
  expect(response.body.lesson).toMatchObject({
    version: 1,
    book: "Luke",
    series: 1,
    lesson: 6
  });
  expect(response.body.lesson.lessonStrings[2]).toMatchObject({
    lessonVersion: 1,
    type: "content",
    motherTongue: true,
    xpath:
      "/office:document-content/office:body/office:text/table:table/table:table-row/table:table-cell[2]/text:p[1]/text()"
  });
  expect(
    findBy(response.body.tStrings as TString[], "text", "Review: Lessons 1-5")
  ).toMatchObject({
    history: [],
    languageId: 1,
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

  await resetStorage();
});

test("Upload French version", async () => {
  expect.assertions(5);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/documents")
    .field("languageId", 2)
    .field("lessonId", 11)
    .attach("document", "cypress/fixtures/Français_Luke-T1-L01.odt");
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
  expect(
    response.body.tStrings.find(
      (tStr: TString) => tStr.masterId == 1 && tStr.languageId == 1
    )
  ).toMatchObject({
    masterId: 1,
    languageId: 1,
    text: "The Book of Luke and the Birth of John the Baptizer"
  });

  await resetStorage();
});

test("Download English Lesson", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages/1/lessons/12/document");
  expect(response.status).toBe(200);
  expect(response.type).toBe("application/vnd.oasis.opendocument.text");
});

test("Download Batanga Lesson", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/lessons/11/document");
  expect(response.status).toBe(200);
  expect(response.type).toBe("application/vnd.oasis.opendocument.text");
});
