import { plainAgent } from "../testHelper";
import { LessonString } from "../../core/models/LessonString";

test("Lesson Strings by Language", async () => {
  expect.assertions(4);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/lessonStrings");
  expect(response.status).toBe(200);
  const lessonStrings: LessonString[] = response.body;
  expect(lessonStrings.length).toBe(6);
  expect(lessonStrings[0]).toEqual({
    lessonStringId: 1,
    masterId: 1,
    lessonVersionId: 101,
    type: "content",
    xpath: "",
    motherTongue: true
  });
  const lessonVersionIds = [101, 102, 103, 104]; // Lesson Versions for Batanga
  expect(
    lessonStrings.every(ls => lessonVersionIds.includes(ls.lessonVersionId))
  ).toBe(true);
});

test("Lesson Strings by LessonVersion", async () => {
  expect.assertions(4);
  const agent = plainAgent();
  const response = await agent.get("/api/lessonVersions/101/lessonStrings");
  expect(response.status).toBe(200);
  const lessonStrings: LessonString[] = response.body;
  expect(lessonStrings.length).toBe(5);
  expect(lessonStrings[0]).toEqual({
    lessonStringId: 1,
    masterId: 1,
    lessonVersionId: 101,
    type: "content",
    xpath: "",
    motherTongue: true
  });
  expect(lessonStrings.every(ls => ls.lessonVersionId == 101)).toBe(true);
});
