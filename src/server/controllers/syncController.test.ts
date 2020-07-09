/// <reference types="jest" />

import { plainAgent, closeStorage } from "../testHelper";

afterAll(closeStorage);

test("Get Sync Empty", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/sync/1594232387331/languages/2,3");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    languages: false,
    baseLessons: false,
    lessons: [],
    tStrings: []
  });
});

test("Get Sync Full", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/sync/4/languages/3");
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    languages: true,
    baseLessons: true
  });
  expect(response.body.lessons).toContain(11);
  expect(response.body.tStrings).toContain(1);
});
