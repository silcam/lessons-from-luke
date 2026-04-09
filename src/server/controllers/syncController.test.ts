/// <reference types="jest" />

import { plainAgent, closeStorage, resetStorage } from "../testHelper";

beforeAll(resetStorage);
afterAll(closeStorage);

test("Get Sync - invalid timestamp returns 400", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/sync/notanumber/languages/");
  expect(response.status).toBe(400);
});

test("Get Sync Empty", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/sync/1594232387331/languages/");
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    languages: false,
    baseLessons: false,
    lessons: [],
    tStrings: {}
  });
});

test("Get Sync Empty With Langs", async () => {
  const agent = plainAgent();
  const response = await agent.get(
    "/api/sync/1594232387331/languages/2-1594232387331,3-1594232387331"
  );
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    languages: false,
    baseLessons: false,
    lessons: [],
    tStrings: { 2: [], 3: [] }
  });
});

test("Get Sync Full", async () => {
  const agent = plainAgent();
  const response = await agent.get(
    "/api/sync/594232387331/languages/3-594232387331"
  );
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    languages: true,
    baseLessons: true
  });
  expect(response.body.lessons).toContain(11);
  expect(response.body.tStrings[3]).toContain(1);
});
