import { loggedInAgent, plainAgent } from "../testHelper";

test("/lessons", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/lessons");
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    lessonId: 11,
    book: "Luke",
    series: 1,
    lesson: 1
  });
});

test("Language Lessons", async () => {
  expect.assertions(3);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/lessonVersions");
  expect(response.status).toBe(200);
  expect(response.body.length).toBe(4);
  expect(response.body[0]).toEqual({
    lessonId: 11,
    version: 1,
    languageId: 3,
    lessonVersionId: 101,
    book: "Luke",
    series: 1,
    lesson: 1
  });
});

test("Langauge Lessons for nonexistant language", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/5005/lessonVersions");
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
});

test("Create Language Lesson", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent
    .post("/api/languageLessons")
    .send({ languageId: 3, lessonId: 15, code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body).toContainEqual({
    lessonId: 15,
    version: 1,
    languageId: 3,
    lessonVersionId: 105,
    book: "Luke",
    series: 1,
    lesson: 5
  });
});

test("Create Language Lesson - Invalid Code", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent
    .post("/api/languageLessons")
    .send({ languageId: 3, lessonId: 15, code: "WRONG" });
  expect(response.status).toBe(401);
});

test("Create Language Lesson - Invalid Type", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.post("/api/languageLessons");
  expect(response.status).toBe(422);
});

test("Create Language Lesson - Invalid Lesson Id", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent
    .post("/api/languageLessons")
    .send({ languageId: 3, lessonId: 999 });
  expect(response.status).toBe(422);
});
