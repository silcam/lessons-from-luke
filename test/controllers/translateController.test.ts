import { loggedInAgent, stripSpace, resetTestStorage } from "../testHelper";
import app from "../../src/app";
import request from "supertest";

beforeAll(() => {
  resetTestStorage();
});

test("Translate Index", async () => {
  expect.assertions(1);
  const response = await request(app).get("/translate/TPINTII");
  // Expect link to translate lesson
  expect(stripSpace(response.text)).toContain(
    `<ahref="&#x2F;translate&#x2F;TPINTII/lesson/Luke-Q1-L01">Luke-Q1-L01</a>`
  );
});

test("Translate lesson page", async () => {
  expect.assertions(1);
  const response = await request(app).get(
    "/translate/TPINTII/lesson/Luke-Q1-L01"
  );
  // Check for a text input
  expect(response.text).toContain(
    `<form action=\"&#x2F;translate&#x2F;TPINTII&#x2F;lesson&#x2F;Luke-Q1-L01\" method=\"post\">`
  );
});

test("Submit translation", async () => {
  expect.assertions(1);
  const response = await request(app)
    .post("/translate/TPINTII/lesson/Luke-Q1-L01")
    .type("form")
    .send(completeTranslationFormData())
    .redirects(1);
  expect(response.text).toContain("100%");
});

// Keep this test last
test("Can't translate locked project", async () => {
  expect.assertions(3);
  // Desktop sync locks the project
  await request(app).get("/desktop/fetch/TPINTII");
  const lockedMessage = "This project is locked for desktop translation.";
  let response = await request(app).get("/translate/TPINTII");
  expect(response.text).toContain(lockedMessage);
  response = await request(app).get("/translate/TPINTII/lesson/Luke-Q1-L01");
  expect(response.text).toContain(lockedMessage);
  response = await request(app)
    .post("/translate/TPINTII/lesson/Luke-Q1-L01")
    .type("form")
    .send(completeTranslationFormData());
  expect(response.text).toContain(lockedMessage);
});

function completeTranslationFormData() {
  let data: { [name: string]: string } = {};
  for (let i = 0; i < 89; ++i) {
    data[`${i}`] = `${i}`;
  }
  return data;
}
