import request from "supertest";
import app from "../../src/app";

test("Error message for sync error", async () => {
  expect.assertions(2);
  const response = await request(app).get("/syncError");
  expect(response.status).toBe(500);
  expect(response.text).toContain("Sorry, there was an error.");
});

test("Error message for async error", async () => {
  expect.assertions(2);
  const response = await request(app).get("/asyncError");
  expect(response.status).toBe(500);
  expect(response.text).toContain("Sorry, there was an error.");
});

test("Custom 404", async () => {
  expect.assertions(2);
  const response = await request(app).get("/nonexistantPath");
  expect(response.status).toBe(404);
  expect(response.text).toContain("Sorry, not found.");
});
