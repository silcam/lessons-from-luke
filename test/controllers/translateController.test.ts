import { stripSpace, resetTestStorage, loggedInAgent } from "../testHelper";
import app from "../../src/app";
import request from "supertest";
import fs from "fs";
import * as Storage from "../../src/util/Storage";

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

test("Post string to translate API", async () => {
  expect.assertions(2);
  let response = await request(app)
    .post("/translate-api/TPINTII/lesson/Luke-Q1-L01")
    .send([{ id: 0, targetText: "Da Book o Luk an" }]);
  expect(response.status).toBe(204);
  response = await request(app).get("/translate/TPINTII/lesson/Luke-Q1-L01");
  expect(response.text).toContain("Da Book o Luk an");
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

test("History is saved", async () => {
  expect.assertions(1);
  await request(app)
    .post("/translate/TPINTII/lesson/Luke-Q1-L01")
    .type("form")
    .send({ 1: "Version 1" })
    .redirects(1);
  await request(app)
    .post("/translate/TPINTII/lesson/Luke-Q1-L01")
    .type("form")
    .send({ 1: "Version 2" })
    .redirects(1);
  expect(
    fs.existsSync(
      "test/strings/translations/Pidgin_1555081479425/history/Luke-Q1-L01.json"
    )
  );
  const history = JSON.parse(
    fs
      .readFileSync(
        "test/strings/translations/Pidgin_1555081479425/history/Luke-Q1-L01.json"
      )
      .toString()
  );
  expect(history[history.length - 1].tStrings).toEqual([
    {
      id: 1,
      xpath:
        "/office:document-content/office:body/office:text/table:table[1]/table:table-row/table:table-cell[2]/text:p[1]/text()[1]",
      src: "The Book of Luke and",
      targetText: "Version 1",
      mtString: true
    }
  ]);
});

test("Copy Translations Ahead", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();

  // Create a lesson 2
  let response = await agent
    .post("/sources/English")
    .field("series", "Luke")
    .attach("document", "test/data/Q1-L01.odt", { filename: "Q1-L02.odt" })
    .redirects(1);

  // Create a new English project
  response = await agent
    .post("/projects")
    .type("form")
    .send({
      sourceLang: "English",
      targetLang: "Canadian"
    })
    .redirects(1);
  const canadianCode = /Canadian.+?href="\/translate\/(\w+)"/s.exec(
    response.text
  )![1];

  // Translate Lesson 1
  response = await agent
    .post(`/translate/${canadianCode}/lesson/Luke-Q1-L01`)
    .type("form")
    .send(completeTranslationFormData())
    .redirects(1);

  // Check that Lesson 2 is partially translated
  const lesson2Percent = /Luke-Q1-L02.+?(\d*)%/s.exec(response.text)![1];
  expect(parseInt(lesson2Percent)).toBeGreaterThan(1);
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
  const data: { [name: string]: string } = {};
  const tStrings = Storage.getTStrings(
    Storage.projectIdFromString("Pidgin_1555081479425"),
    "Luke-Q1-L01"
  );
  return tStrings.reduce((data, tString) => {
    if (tString.mtString) {
      data[`${tString.id}`] = `${tString.id}`;
    }
    return data;
  }, data);
}
