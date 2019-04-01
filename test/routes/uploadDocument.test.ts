import request from "supertest";
import app from "../../src/app";
import { loggedInAgent } from "../testHelper";

test("uploadDoc : invalid language", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/documents")
    .type("form")
    .send({ language: "" });
  expect(response.text).toContain("Language can&#39;t be blank.");
});

test("uploadDoc : invalid file", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/documents")
    .type("form")
    .send({ language: "English" });
  expect(response.text).toContain("No file was attached.");
});
