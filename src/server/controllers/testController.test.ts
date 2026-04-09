/// <reference types="jest" />

import { plainAgent, closeStorage } from "../testHelper";

afterAll(closeStorage);

test("POST /api/test/persist-storage returns 204", async () => {
  const agent = plainAgent();
  const response = await agent.post("/api/test/persist-storage");
  expect(response.status).toBe(204);
});
