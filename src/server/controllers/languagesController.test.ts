/// <reference types="jest" />

import { Pool } from "pg";
import crypto from "crypto";
import { plainAgent, loggedInAgent } from "../testHelper";
import { isLanguage, LessonProgress, Language } from "../../core/models/Language";
import fs from "fs";
import { findByStrict } from "../../core/util/arrayUtils";
import { TestPersistence } from "../../core/interfaces/Persistence";
import secrets from "../util/secrets";

const usfm = fs.readFileSync("cypress/fixtures/43LUKBMO.SFM").toString();

// ---------------------------------------------------------------------------
// Auth pool for inserting a non-admin test user directly (sign-up is disabled
// globally). Mirrors the pattern in invitationController.test.ts.
// ---------------------------------------------------------------------------

const { username: dbUser, ...restTestDb } = secrets.testDb as typeof secrets.testDb & {
  username: string;
};
const authPool = new Pool({ ...restTestDb, user: dbUser, max: 2 });

afterAll(async () => {
  await authPool.end();
});

/**
 * Insert a non-admin user directly into the auth tables (bypasses disabled
 * sign-up). Returns the agent signed in as that user.
 */
async function nonAdminAgent() {
  const email = `nonadmin-lang-ctrl-test-${crypto.randomUUID()}@example.com`;
  const password = "TestPassword1!";
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = new Date();

  const { hash: argon2idHash } =
    require("../auth/passwordHasher") as typeof import("../auth/passwordHasher");
  const passwordHash = await argon2idHash(password);

  const client = await authPool.connect();
  try {
    await client.query(
      `INSERT INTO "user" ("id","email","name","admin","emailVerified","createdAt","updatedAt")
       VALUES ($1,$2,'NonAdmin',false,false,$3,$3)`,
      [userId, email.toLowerCase(), now]
    );
    await client.query(
      `INSERT INTO "account" ("id","userId","accountId","providerId","password","createdAt","updatedAt")
       VALUES ($1,$2,$2,'credential',$3,$4,$4)`,
      [accountId, userId, passwordHash, now]
    );
  } finally {
    client.release();
  }

  const agent = plainAgent();
  await agent.post("/api/auth/sign-in/email").send({ email, password });
  return agent;
}

test("Public Languages", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages");
  expect(response.status).toBe(200);
  expect(findByStrict(response.body as Language[], "name", "English")).toMatchObject({
    languageId: 1,
    name: "English",
  });
  expect(response.body.length).toBe(3);
});

test("Admin Languages", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  const response = await agent.get("/api/admin/languages");
  expect(response.status).toBe(200);
  expect(findByStrict(response.body as Language[], "name", "English")).toMatchObject({
    languageId: 1,
    name: "English",
    code: "ABC",
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
    code: "GHI",
  });
});

test("Get Language by code - Invalid Code", async () => {
  expect.assertions(2);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/code/XYZ");
  expect(response.status).toBe(200);
  expect(response.body).toBeNull();
});

test("Get Language by code - Archived Language's Code (RT-D)", async () => {
  expect.assertions(2);
  const storage: TestPersistence = (global as any).testStorage;
  await storage.updateLanguage(3, { archived: true });
  const agent = plainAgent();
  const response = await agent.get("/api/languages/code/GHI");
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
  expect(englishProgess.every((p) => p.progress == 100)).toBe(true);
  const batangaProgress = findByStrict(response.body as Language[], "languageId", 3).progress;
  expect(batangaProgress[0]).toEqual({
    lessonId: 11,
    progress: 6,
  });
});

test("POST /api/languages", async () => {
  expect.assertions(3);
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages")
    .send({ name: "Klingon", defaultSrcLang: 2 });
  expect(response.status).toBe(200);
  expect(isLanguage(response.body)).toBe(true);
  expect(response.body).toMatchObject({ name: "Klingon", defaultSrcLang: 2 });
});

test("POST /api/languages requires login", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.post("/api/admin/languages").send({ name: "Klingon" });
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
  const response = await agent.post("/api/admin/languages/3").send({ motherTongue: false });
  expect(response.status).toBe(200);
  const batanga: Language = response.body;
  expect(batanga.motherTongue).toBe(false);
  expect(batanga.progress[0].progress).toBe(5); // Was 6
});

test("POST update language defaultSrcLang", async () => {
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3").send({ defaultSrcLang: 2 });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    name: "Batanga",
    defaultSrcLang: 2,
  });
});

// POST /api/admin/languages/:languageId re-point guard — RED
// (lessons-from-luke-e044.5.5.2, RT-B/RT-F/RT-H). The endpoint still calls
// storage.updateLanguage directly (no active-source check) — it must route
// through storage.updateLanguageChecked and surface its 422 rejection.
test("POST update language: 422 when defaultSrcLang re-points to an archived language", async () => {
  const storage: TestPersistence = (global as any).testStorage;
  await storage.updateLanguage(2, { archived: true });

  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3")
    .send({ motherTongue: true, defaultSrcLang: 2 });
  expect(response.status).toBe(422);
});

test("POST usfm", async () => {
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3/usfm").send({ usfm });
  expect(response.status).toBe(200);
  expect(response.body.language.progress[0]).toEqual({
    lessonId: 11,
    progress: 23, // Was 6
  });
  expect(response.body.errors).toEqual([]);
  expect(response.body.tStrings.length).toBe(60);
  expect(response.body.tStrings).toContainEqual({
    history: [],
    languageId: 3,
    masterId: 179,
    text: "Luka 1:13 Ndɔ ŋgaŋ ntaoŋ ghɔ chhu ŋa, “Kiʼi mfāʼo pɔgɔ gu, ma Shakaria. Minnwi yaʼo luoŋ yɔ. Ɛlishabe ŋgwɛ ghɔ shi mbhi muuŋ mimbia ɔ chhɔ̄ ligi yi ni Jouŋ.",
  });
});

test("POST usfm with non-existent languageId returns 404", async () => {
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/99999/usfm").send({ usfm });
  expect(response.status).toBe(404);
});

test("POST usfm with error expected", async () => {
  expect.assertions(2);
  const tweakedUsfm = usfm.replace("\\v 36", "\\v 36-37").replace("\\v 37", "");
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3/usfm").send({ usfm: tweakedUsfm });
  expect(response.status).toBe(200);
  expect(response.body.errors).toContain(
    "The following error occurred while processing « Luke 1:37 For nothing is impossible with God. » : Could not find 1:37."
  );
});

// ---------------------------------------------------------------------------
// POST /api/admin/languages/:languageId/archive — RED
// (lessons-from-luke-e044.5.4.4). The route does not exist yet — these tests
// should fail with 404 from Express until the endpoint is registered.
// Spec: specs/012-language-archive-routing/contracts/archive-language.md
// ---------------------------------------------------------------------------

test("POST archive: 200 with ok body when the target has no active dependents", async () => {
  expect.assertions(2);
  const agent = await loggedInAgent();
  // Fixture language 2 (Français) has no other active language pointing at it
  // as defaultSrcLang, so it archives cleanly.
  const response = await agent.post("/api/admin/languages/2/archive").send({});
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ archived: true, languageId: 2 });
});

test("POST archive: 200 with blocked body when active dependents exist", async () => {
  expect.assertions(3);
  const agent = await loggedInAgent();
  // Fixture languages 2 (Français) and 3 (Batanga) both default to source
  // language 1 (English), so language 1 has two active dependents.
  const response = await agent.post("/api/admin/languages/1/archive").send({});
  expect(response.status).toBe(200);
  expect(response.body.error).toBe("HAS_DEPENDENTS");
  expect(response.body.dependents).toEqual(
    expect.arrayContaining([
      { languageId: 2, name: "Français" },
      { languageId: 3, name: "Batanga" },
    ])
  );
});

test("POST archive: 404 for a nonexistent languageId", async () => {
  expect.assertions(1);
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/99999/archive").send({});
  expect(response.status).toBe(404);
});

test("POST archive: 404 for an already-archived languageId", async () => {
  expect.assertions(1);
  const storage: TestPersistence = (global as any).testStorage;
  await storage.updateLanguage(3, { archived: true });
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3/archive").send({});
  expect(response.status).toBe(404);
});

test("POST archive: 401 for an unauthenticated request", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.post("/api/admin/languages/2/archive").send({});
  expect(response.status).toBe(401);
});

test("POST archive: 403 for a non-admin session", async () => {
  expect.assertions(1);
  const agent = await nonAdminAgent();
  const response = await agent.post("/api/admin/languages/2/archive").send({});
  expect(response.status).toBe(403);
});
