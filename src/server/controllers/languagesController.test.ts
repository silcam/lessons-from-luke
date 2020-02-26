import { plainAgent, loggedInAgent } from "../testHelper";
import {
  isLanguage,
  LessonProgress,
  Language
} from "../../core/models/Language";
import fs from "fs";

const usfm = fs.readFileSync("test/43LUKBMO.SFM").toString();

test("Public Languages", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/languages");
  expect(response.status).toBe(200);
  expect(response.body[0]).toMatchObject({
    languageId: 1,
    name: "English"
  });
});

test("Admin Languages", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent.get("/api/admin/languages");
  expect(response.status).toBe(200);
  expect(response.body[0]).toMatchObject({
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
  expect(response.body).toMatchObject({
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

test("Get language progress", async () => {
  expect.assertions(4);
  const agent = plainAgent();
  const response = await agent.get("/api/languages");
  expect(response.status).toBe(200);
  const englishProgess: LessonProgress[] = response.body[0].progress;
  expect(englishProgess.length).toBe(5);
  expect(englishProgess.every(p => p.progress == 100)).toBe(true);
  const batangaProgress = response.body[2].progress;
  expect(batangaProgress[0]).toEqual({
    lessonId: 11,
    progress: 6
  });
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

test("POST update language mother tongue status", async () => {
  expect.assertions(3);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3")
    .send({ motherTongue: false });
  expect(response.status).toBe(200);
  const batanga: Language = response.body;
  expect(batanga.motherTongue).toBe(false);
  expect(batanga.progress[0].progress).toBe(5); // Was 6
});

test("POST usfm", async () => {
  expect.assertions(3);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3/usfm")
    .send({ usfm });
  expect(response.status).toBe(200);
  expect(response.body.language.progress[0].progress).toBe(14); // Was 6
  expect(response.body.errors).toEqual([]);
});

test("POST usfm with error expected", async () => {
  expect.assertions(2);
  const tweakedUsfm = usfm.replace("\\v 36", "\\v 36-37").replace("\\v 37", "");
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3/usfm")
    .send({ usfm: tweakedUsfm });
  expect(response.status).toBe(200);
  expect(response.body.errors[0]).toEqual(
    "USFM Parse Error - Verse 37 not found in chapter 1."
  );
});
