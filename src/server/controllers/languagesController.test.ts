import {
  plainAgent,
  loggedInAgent,
  resetStorage,
  closeStorage
} from "../testHelper";
import {
  isLanguage,
  LessonProgress,
  Language
} from "../../core/models/Language";
import fs from "fs";
import { findByStrict } from "../../core/util/arrayUtils";

const usfm = fs.readFileSync("test/43LUKBMO.SFM").toString();

afterAll(closeStorage);

test("Public Languages", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages");
  expect(response.status).toBe(200);
  expect(
    findByStrict(response.body as Language[], "name", "English")
  ).toMatchObject({
    languageId: 1,
    name: "English"
  });
  expect(response.body.length).toBe(3);
});

test("Admin Languages", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent.get("/api/admin/languages");
  expect(response.status).toBe(200);
  expect(
    findByStrict(response.body as Language[], "name", "English")
  ).toMatchObject({
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
  const englishProgess: LessonProgress[] = findByStrict(
    response.body as Language[],
    "name",
    "English"
  ).progress;
  expect(englishProgess.length).toBe(5);
  expect(englishProgess.every(p => p.progress == 100)).toBe(true);
  const batangaProgress = findByStrict(
    response.body as Language[],
    "languageId",
    3
  ).progress;
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
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3")
    .send({ motherTongue: false });
  expect(response.status).toBe(200);
  const batanga: Language = response.body;
  expect(batanga.motherTongue).toBe(false);
  expect(batanga.progress[0].progress).toBe(5); // Was 6

  await resetStorage();
});

test("POST usfm", async () => {
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3/usfm")
    .send({ usfm });
  expect(response.status).toBe(200);
  expect(response.body.language.progress[0]).toEqual({
    lessonId: 11,
    progress: 23 // Was 6
  });
  expect(response.body.errors).toEqual([]);
  expect(response.body.tStrings.length).toBe(60);
  expect(response.body.tStrings).toContainEqual({
    history: [],
    languageId: 3,
    masterId: 179,
    text:
      "Luka 1:13 Ndɔ ŋgaŋ ntaoŋ ghɔ chhu ŋa, “Kiʼi mfāʼo pɔgɔ gu, ma Shakaria. Minnwi yaʼo luoŋ yɔ. Ɛlishabe ŋgwɛ ghɔ shi mbhi muuŋ mimbia ɔ chhɔ̄ ligi yi ni Jouŋ."
  });

  await resetStorage();
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

  await resetStorage();
});
