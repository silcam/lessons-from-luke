import { loggedInAgent, plainAgent } from "../testHelper";

test("GET Lessons", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/lessons");
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    lessonId: 11,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 2
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
    version: 2
  });
  expect(response.body.lessonStrings[0]).toMatchObject({
    lessonStringId: 1,
    masterId: 1,
    lessonId: 11,
    lessonVersion: 2,
    type: "content",
    xpath: "",
    motherTongue: true
  });
});

test("GET Lesson by Id : 404 for bad id", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.get("/api/lessons/0");
  expect(response.status).toBe(404);
});
