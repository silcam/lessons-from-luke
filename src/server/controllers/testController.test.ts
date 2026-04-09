/// <reference types="jest" />

import { plainAgent, closeStorage } from "../testHelper";

afterAll(closeStorage);

test("POST /api/test/persist-storage returns 204", async () => {
  const agent = plainAgent();
  const response = await agent.post("/api/test/persist-storage");
  expect(response.status).toBe(204);
});

test("POST /api/test/reset-storage returns 204", async () => {
  const agent = plainAgent();
  const response = await agent.post("/api/test/reset-storage");
  expect(response.status).toBe(204);
});

test("POST /api/test/close-storage returns 204", async () => {
  const agent = plainAgent();
  const response = await agent.post("/api/test/close-storage");
  expect(response.status).toBe(204);
});
