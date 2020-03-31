/// <reference types="jest" />

import {
  loggedInAgent,
  plainAgent,
  resetStorage,
  closeStorage
} from "../testHelper";
import { LessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { DocString } from "../../core/models/DocString";
import { unlinkSafe } from "../../core/util/fsUtils";
import { findByStrict } from "../../core/util/arrayUtils";

beforeAll(resetStorage);
afterAll(async () => {
  unlinkSafe("test/docs/serverDocs/Luke-1-01v04.odt");
  await closeStorage();
});

test("GET Lessons", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/lessons");
  expect(response.status).toBe(200);
  expect(response.body).toContainEqual({
    lessonId: 11,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 3
  });
});

test("GET Lesson by Id", async () => {
  expect.assertions(3);
  const agent = plainAgent();
  const response = await agent.get("/api/lessons/11");
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    lessonId: 11,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 3
  });
  expect(response.body.lessonStrings[0]).toMatchObject({
    lessonStringId: 7,
    masterId: 5,
    lessonId: 11,
    lessonVersion: 3,
    type: "content",
    motherTongue: false
  });
});

test("GET Lesson by Id : 404 for bad id", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.get("/api/lessons/0");
  expect(response.status).toBe(404);
});

test("GET Lesson HTML", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/lessons/11/webified");
  expect(response.status).toBe(200);
  expect(response.body.html).toContain("<title>Lessons from Luke</title>");
  expect(response.body.html).toContain(
    '<img src="/webified/1585663144340_1-01_htm_9f2086952548eae4.png" name="graphics14" align="middle" width="71" height="71" border="0"/>'
  );
});

test("GET nonexistant Lesson HTML", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/lessons/12/webified");
  expect(response.status).toBe(404);
});

test("Update Lesson 1", async () => {
  expect.assertions(4);
  const agent = await loggedInAgent();
  let response = await agent.get("/api/lessons/11");
  const lessonStrings: LessonString[] = response.body.lessonStrings;
  const oldLessonStringCount = lessonStrings.length;
  response = await agent.get("/api/languages/1/lessons/11/tStrings");
  const tStrings: TString[] = response.body;
  const docStrings: DocString[] = lessonStrings.map(lStr => ({
    motherTongue: lStr.motherTongue,
    type: lStr.type,
    xpath: lStr.xpath,
    text: tStrings.find(
      tStr => tStr.languageId == 1 && tStr.masterId == lStr.masterId
    )!.text
  }));

  // Eliminate one string
  docStrings[0].text = "";
  const xPathToNotFindLater = docStrings[0].xpath;

  // Edit another
  docStrings[1].text = "The Book of Luke and the Birth of John the Dude";

  response = await agent.post("/api/admin/lessons/11/strings").send(docStrings);
  expect(response.status).toBe(200);

  // The one we removed
  expect(
    response.body.lesson.lessonStrings.find(
      (str: LessonString) => str.xpath == xPathToNotFindLater
    )
  ).toBeUndefined();
  expect(response.body.lesson.lessonStrings.length).toBe(
    oldLessonStringCount - 1
  );

  // The one we edited
  expect(
    findByStrict(
      response.body.tStrings as TString[],
      "text",
      "The Book of Luke and the Birth of John the Dude"
    )
  ).toMatchObject({
    history: [],
    languageId: 1,
    text: "The Book of Luke and the Birth of John the Dude"
  });

  await resetStorage();
});
