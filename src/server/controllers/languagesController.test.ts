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

// POST /api/admin/languages/:languageId name-absent regression lock
// (lessons-from-luke-fm4a.5.1.7/8/9). A body with no `name` key must leave
// the stored name untouched and must not add a second, name-driven
// storage.languages() read on top of the one updateProgress() already makes
// on every update — the rename feature's duplicate-name lookup (US2) is
// scoped to name-present requests only.
test("POST update language: name-absent updates (motherTongue/defaultSrcLang only) are unaffected", async () => {
  const storage: TestPersistence = (global as any).testStorage;
  const languagesSpy = jest.spyOn(storage, "languages");
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages/3")
    .send({ motherTongue: true, defaultSrcLang: 2 });
  expect(response.status).toBe(200);
  expect(response.body.name).toBe("Batanga");
  expect(languagesSpy).toHaveBeenCalledTimes(1);
  languagesSpy.mockRestore();
});

// POST /api/admin/languages/:languageId rename — RED (lessons-from-luke-fm4a.5.1.4)
// The endpoint doesn't accept `name` yet — objFilter doesn't whitelist it.
test("POST update language: valid trimmed name is accepted and persisted", async () => {
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3").send({ name: "  New Name  " });
  expect(response.status).toBe(200);
  const language: Language = response.body;
  expect(language.name).toBe("New Name");
});

// POST /api/admin/languages/:languageId rename — RED (lessons-from-luke-fm4a.5.2.5, N-3)
// Empty or whitespace-only name (after trimming) must be rejected 422, and the
// stored name must be left completely unchanged.
test("POST update language: 422 when name is empty or whitespace-only, stored name unchanged", async () => {
  const storage: TestPersistence = (global as any).testStorage;
  const before = await storage.language({ languageId: 3 });

  const agent = await loggedInAgent();

  const emptyResponse = await agent.post("/api/admin/languages/3").send({ name: "" });
  expect(emptyResponse.status).toBe(422);

  const whitespaceResponse = await agent.post("/api/admin/languages/3").send({ name: "   " });
  expect(whitespaceResponse.status).toBe(422);

  const after = await storage.language({ languageId: 3 });
  expect(after?.name).toBe(before?.name);
});

// POST /api/admin/languages/:languageId rename — RED (lessons-from-luke-fm4a.5.2.8, N-7/N-8)
// A trimmed name longer than 100 characters, or containing a C0/C1 control
// character, must be rejected 422. This rule applies to the rename path only
// (language creation is untouched). A 100-character name (boundary) must
// still succeed.
test("POST update language: 422 when trimmed name exceeds 100 characters", async () => {
  const agent = await loggedInAgent();
  const tooLong = "A".repeat(101);
  const response = await agent.post("/api/admin/languages/3").send({ name: tooLong });
  expect(response.status).toBe(422);
});

test("POST update language: 422 when name contains a control character", async () => {
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3").send({ name: "A\nB" });
  expect(response.status).toBe(422);
});

test("POST update language: 200 when trimmed name is exactly 100 characters", async () => {
  const agent = await loggedInAgent();
  const boundary = "A".repeat(100);
  const response = await agent.post("/api/admin/languages/3").send({ name: boundary });
  expect(response.status).toBe(200);
  const language: Language = response.body;
  expect(language.name).toBe(boundary);
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

// POST /api/admin/languages/:languageId rename — RED (lessons-from-luke-fm4a.5.2.14, N-4)
// A rename to a name that case-insensitively matches another ACTIVE
// language's name (not the target's own row) is rejected 409, matching the
// create endpoint's duplicate semantics; archived languages' names do not
// count as collisions.
test("POST update language: 409 when new name case-insensitively collides with another active language", async () => {
  const agent = await loggedInAgent();
  // Fixture language 2 is "Français" (active); rename language 3 (Batanga)
  // to a different-case match of it.
  const response = await agent.post("/api/admin/languages/3").send({ name: "français" });
  expect(response.status).toBe(409);
});

// POST /api/admin/languages/:languageId rename TOCTOU close — lessons-from-luke-fm4a.9
// Two concurrent renames targeting the same new name must not both commit:
// the duplicate-name check now runs FOR UPDATE inside updateLanguageChecked's
// own transaction, so exactly one request succeeds (200) and the other is
// rejected (409) — never two 200s.
test("POST update language: concurrent renames to the same name yield exactly one 200 and one 409", async () => {
  const agentA = await loggedInAgent();
  const agentB = await loggedInAgent();

  const [responseA, responseB] = await Promise.all([
    agentA.post("/api/admin/languages/2").send({ name: "Racer Language" }),
    agentB.post("/api/admin/languages/3").send({ name: "Racer Language" }),
  ]);

  const statuses = [responseA.status, responseB.status].sort();
  expect(statuses).toEqual([200, 409]);
});

// POST /api/admin/languages/:languageId rename — RED (lessons-from-luke-fm4a.5.2.11, D-002)
// The not-found check MUST run and win BEFORE the duplicate-name check: a
// rename against a nonexistent languageId returns 404 even when the
// submitted name collides with an existing active language's name.
test("POST update language: 404 for nonexistent languageId, even when the new name collides with an active language", async () => {
  const agent = await loggedInAgent();
  // Fixture language 2 is "Français" (active); languageId 99999 does not exist.
  const response = await agent.post("/api/admin/languages/99999").send({ name: "Français" });
  expect(response.status).toBe(404);
});

test("POST update language: 200 when new name matches an archived language's name", async () => {
  const storage: TestPersistence = (global as any).testStorage;
  await storage.updateLanguage(2, { archived: true });

  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3").send({ name: "Français" });
  expect(response.status).toBe(200);
  const language: Language = response.body;
  expect(language.name).toBe("Français");
});

test("POST update language: 404 when the target language is archived", async () => {
  const storage: TestPersistence = (global as any).testStorage;
  await storage.updateLanguage(3, { archived: true });

  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3").send({ motherTongue: false });
  expect(response.status).toBe(404);
});

// POST /api/admin/languages/:languageId rename — RED (lessons-from-luke-fm4a.7)
// A name containing path-traversal segments must be rejected 422 so it can
// never be interpolated into a filesystem path (makeLessonFile/docStorage).
test("POST update language: 422 when name contains path traversal segments", async () => {
  const agent = await loggedInAgent();
  const response = await agent.post("/api/admin/languages/3").send({ name: "../../../evil" });
  expect(response.status).toBe(422);
});

// POST /api/admin/languages create — RED (lessons-from-luke-fm4a.7)
// Language creation predates the rename endpoint's validation; it must be
// brought in line so both routes reject path-traversal names identically.
test("POST /api/languages: 422 when name contains path traversal segments", async () => {
  const agent = await loggedInAgent();
  const response = await agent
    .post("/api/admin/languages")
    .send({ name: "../../../evil", defaultSrcLang: 2 });
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
