import request from "supertest";
import app from "../src/server/app";
import secrets from "../src/server/util/secrets";

test("api:css", async () => {
  expect.assertions(1);
  const response = await request(app).get("/lessons.css");
  expect(response.status).toBe(200);
});

test("api : public home", async () => {
  expect.assertions(2);
  const response = await request(app).get("/");
  expect(response.status).toBe(200);
  // Check for login form
  expect(response.text).toContain("<form action='/login' method='post'>");
});

test("api : bad login", async () => {
  expect.assertions(2);
  const response = await request(app)
    .post("/login")
    .type("form")
    .send({ username: "wrong", password: "nope" })
    .redirects(1);
  expect(response.status).toBe(200);
  expect(response.text).toContain("Sorry, that didn&#39;t work.");
});

test("api : good login", async () => {
  expect.assertions(2);
  const agent = request.agent(app);
  const response = await agent
    .post("/login")
    .type("form")
    .send({ username: secrets.adminUsername, password: secrets.adminPassword })
    .redirects(1);
  expect(response.status).toBe(200);
  expect(response.text).toContain(`<div id="adminHome">`);
});

test("api : require admin", async () => {
  expect.assertions(2);
  const response = await request(app).get("/sources/English");
  expect(response.status).toBe(302);
  expect(response.header.location).toEqual("/");
});
