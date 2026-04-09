/// <reference types="jest" />

import { plainAgent, loggedInAgent, closeStorage } from "../testHelper";

afterAll(closeStorage);

test("GET /api/users/current returns null when not logged in", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/users/current");
  expect(response.status).toBe(200);
  expect(response.body).toBeNull();
});

test("GET /api/users/current returns user when logged in", async () => {
  const agent = await loggedInAgent();
  const response = await agent.get("/api/users/current");
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ id: 1, admin: true });
});

test("POST /api/users/login with wrong credentials returns 422", async () => {
  const agent = plainAgent();
  const response = await agent
    .post("/api/users/login")
    .send({ username: "wrong", password: "bad" });
  expect(response.status).toBe(422);
});

test("POST /api/users/login with correct credentials returns user", async () => {
  const agent = await loggedInAgent();
  const response = await agent.get("/api/users/current");
  expect(response.body).toMatchObject({ id: 1, admin: true });
});

test("POST /api/users/logout clears session", async () => {
  const agent = await loggedInAgent();

  // Confirm logged in
  let response = await agent.get("/api/users/current");
  expect(response.body).toMatchObject({ id: 1, admin: true });

  // Logout
  const logoutResponse = await agent.post("/api/users/logout");
  expect(logoutResponse.status).toBe(200);

  // Confirm logged out
  response = await agent.get("/api/users/current");
  expect(response.body).toBeNull();
});
