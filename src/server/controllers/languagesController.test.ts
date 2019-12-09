import { plainAgent, loggedInAgent } from "../testHelper";
import { isLanguage } from "../../core/models/Language";

test("Public Languages", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/languages");
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    languageId: 1,
    name: "English"
  });
});

test("Admin Languages", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent.get("/api/admin/languages");
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    languageId: 1,
    name: "English",
    code: "ABC"
  });
});

test("Get Language by code", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/code/GHI");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    languageId: 3,
    name: "Batanga",
    code: "GHI"
  });
});

test("Get Language by code - Invalid Code", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/code/XYZ");
  expect(response.status).toBe(200);
  expect(response.body).toBeNull();
});

test("POST /api/languages", async () => {
  expect.assertions(3);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages")
    .send({ name: "Klingon" });
  expect(response.status).toBe(200);
  expect(isLanguage(response.body)).toBe(true);
  expect(response.body.name).toEqual("Klingon");
});

test("POST /api/languages requires login", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent
    .post("/api/admin/languages")
    .send({ name: "Klingon" });
  expect(response.status).toBe(401);
});

test("POST /api/languages validation", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages");
  expect(response.status).toBe(422);
});
