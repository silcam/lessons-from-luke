/// <reference types="jest" />

import { plainAgent } from "../testHelper";
import { TString } from "../../core/models/TString";
import { TestPersistence } from "../../core/interfaces/Persistence";
import { COVER_A4_LESSON } from "../../core/models/Lesson";
import { DocString } from "../../core/models/DocString";
import { saveDocStrings } from "../actions/updateLesson";

const storage: TestPersistence = (global as any).testStorage;

test("Get TStrings", async () => {
  expect.assertions(3);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/tStrings");
  expect(response.status).toBe(200);
  expect(response.body.length).toBe(4);
  expect(response.body[0]).toEqual({
    languageId: 3,
    sourceLanguageId: 2,
    text: "Pɔh eyamu ya Lukasi etilinɔ na iyabɛnɛ dá Yohanesi Nkahɛdɛni",
    source: "Le livre de Luc et la naissance de Jean Baptiste",
    history: [],
    masterId: 1,
    lessonStringId: null,
  });
});

test("Get TStrings by Lesson", async () => {
  expect.assertions(3);
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/lessons/11/tStrings");
  expect(response.status).toBe(200);
  expect(response.body.length).toBe(3);
  expect(response.body[0]).toEqual({
    languageId: 3,
    sourceLanguageId: 2,
    text: "Pɔh eyamu ya Lukasi etilinɔ na iyabɛnɛ dá Yohanesi Nkahɛdɛni",
    source: "Le livre de Luc et la naissance de Jean Baptiste",
    history: [],
    masterId: 1,
    lessonStringId: null,
  });
});

test("Get TStrings - invalid ids", async () => {
  expect.assertions(4);
  const agent = plainAgent();
  let response = await agent.get("/api/languages/9999/lessons/101/tStrings");
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
  response = await agent.get("/api/languages/3/lessons/9999/tStrings");
  expect(response.status).toBe(200);
  expect(response.body).toEqual([]);
});

test("Get TStrings by master ids", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/tStrings/1,3");
  expect(response.status).toBe(200);
  expect(response.body.length).toBe(2);
  expect(response.body).toContainEqual({
    masterId: 1,
    languageId: 3,
    text: "Pɔh eyamu ya Lukasi etilinɔ na iyabɛnɛ dá Yohanesi Nkahɛdɛni",
    source: "Le livre de Luc et la naissance de Jean Baptiste",
    sourceLanguageId: 2,
    history: [],
    lessonStringId: null,
  });
});

test("Save TString - Invalid Type", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.post("/api/tStrings").send({});
  expect(response.status).toBe(422);
});

test("Save TString - Invalid Code", async () => {
  expect.assertions(1);
  const agent = plainAgent();
  const response = await agent.post("/api/tStrings").send({
    tStrings: [
      {
        masterId: 2,
        languageId: 3,
        text: "weivrevO nosseL",
        source: "ommaire de la leçon",
        sourceLanguageId: 2,
        history: [],
      },
    ],
    code: "WRONG",
  });
  expect(response.status).toBe(401);
});

test("Save TString - new string", async () => {
  const tString: TString = {
    masterId: 2,
    languageId: 3,
    text: "weivrevO nosseL",
    source: "ommaire de la leçon",
    sourceLanguageId: 2,
    history: [],
  };
  expect.assertions(4);
  const agent = plainAgent();
  expect(await batangaTStringCount(agent)).toBe(3);
  const response = await agent.post("/api/tStrings").send({ tStrings: [tString], code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual(tString);
  expect(await batangaTStringCount(agent)).toBe(4);
});

test("Save TString - updated string", async () => {
  const tStrings = [
    {
      masterId: 3,
      languageId: 3,
      text: "sreyarp ruo sraeh doG",
      source: "God hears our prayers.",
      sourceLanguageId: 1,
      history: [],
    },
  ];
  expect.assertions(4);
  const agent = plainAgent();
  expect(await batangaTStringCount(agent)).toBe(3);
  const response = await agent.post("/api/tStrings").send({ tStrings, code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    ...tStrings[0],
    history: ["Njambɛ abowandi mahaleya mahu."],
  });
  expect(await batangaTStringCount(agent)).toBe(3);
});

test("Save TString - blank text", async () => {
  const tStrings: TString[] = [
    {
      masterId: 3,
      languageId: 3,
      text: "",
      history: [],
    },
  ];
  expect.assertions(4);
  const agent = plainAgent();
  expect(await batangaTStringCount(agent)).toBe(3);
  const response = await agent.post("/api/tStrings").send({ tStrings, code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    ...tStrings[0],
    history: ["Njambɛ abowandi mahaleya mahu."],
  });
  expect(await batangaTStringCount(agent)).toBe(3);
});

test("Get TStrings by master ids - invalid languageId returns 400", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages/0/tStrings/1,3");
  expect(response.status).toBe(400);
});

test("Get TStrings by master ids - invalid masterId in list returns 400", async () => {
  const agent = plainAgent();
  const response = await agent.get("/api/languages/3/tStrings/1,abc");
  expect(response.status).toBe(400);
});

test("Save TString - invalid tString object returns 422", async () => {
  const agent = plainAgent();
  const response = await agent.post("/api/tStrings").send({
    code: "GHI",
    tStrings: [{ masterId: "not-a-number", text: 42 }],
  });
  expect(response.status).toBe(422);
});

test("Save TString - empty tStrings array returns 422", async () => {
  const agent = plainAgent();
  const response = await agent.post("/api/tStrings").send({
    code: "GHI",
    tStrings: [],
  });
  expect(response.status).toBe(422);
});

async function batangaTStringCount(agent: ReturnType<typeof plainAgent>): Promise<number> {
  const response = await agent.get("/api/languages/3/lessons/11/tStrings");
  return response.body.length;
}

/**
 * FR-007 guard test — "cover-only strings translatable once and remain
 * editable thereafter" (US14, spec.md §FR-007).
 *
 * A cover-only string (e.g. a copyright line) is novel text with no
 * existing master-string match anywhere else, so it gets its own new
 * masterId when the cover is "uploaded" (simulated via `saveDocStrings`,
 * exactly as `updateLesson` does for a real ODT upload of a reserved cover
 * lesson number). This test asserts that such a string can be translated
 * for the first time — and edited again afterward (e.g. a publication-year
 * change) — through the SAME `/api/tStrings` HTTP endpoint used for any
 * ordinary lesson string. `tStringsController` has no cover-specific
 * branch (it only ever deals in masterId/languageId), and none is needed.
 */
test("FR-007: a cover-only string is translatable once via /api/tStrings and remains editable afterward", async () => {
  const COVER_COPYRIGHT_TEXT = "© 2026 Lessons from Luke. All rights reserved.";
  const LANGUAGE_ID = 3; // Batanga, code GHI
  const CODE = "GHI";

  // A cover ("uploaded" via the same saveDocStrings pipeline updateLesson
  // uses for a real ODT) contains novel text with no existing master match.
  const coverLesson = await storage.createLesson({
    book: "Luke",
    series: 1,
    lesson: COVER_A4_LESSON,
  });
  const coverDocStrings: DocString[] = [
    {
      type: "content",
      xpath: "cover:/copyright",
      motherTongue: false,
      text: COVER_COPYRIGHT_TEXT,
    },
  ];
  const finalLesson = await saveDocStrings(
    coverLesson.lessonId,
    coverLesson.version + 1,
    coverDocStrings,
    storage
  );
  const masterId = finalLesson.lessonStrings[0].masterId;

  const agent = plainAgent();

  // First translation, via the ordinary generic translation endpoint.
  const firstTranslation = "© 2026 Njambea abowandi mahaleya mahu. All rights reserved.";
  const createResponse = await agent.post("/api/tStrings").send({
    code: CODE,
    tStrings: [
      {
        masterId,
        languageId: LANGUAGE_ID,
        text: firstTranslation,
        history: [],
      },
    ],
  });
  expect(createResponse.status).toBe(200);
  expect(createResponse.body[0]).toEqual({
    masterId,
    languageId: LANGUAGE_ID,
    text: firstTranslation,
    history: [],
  });

  // Edited again afterward (e.g. simulating a publication-year change),
  // through the exact same endpoint — no cover-specific workflow.
  const updatedTranslation = "© 2027 Njambea abowandi mahaleya mahu. All rights reserved.";
  const updateResponse = await agent.post("/api/tStrings").send({
    code: CODE,
    tStrings: [
      {
        masterId,
        languageId: LANGUAGE_ID,
        text: updatedTranslation,
        history: [],
      },
    ],
  });
  expect(updateResponse.status).toBe(200);
  expect(updateResponse.body[0]).toEqual({
    masterId,
    languageId: LANGUAGE_ID,
    text: updatedTranslation,
    history: [firstTranslation],
  });

  // Confirm the edit is durably reflected via the ordinary GET path too.
  const getResponse = await agent.get(`/api/languages/${LANGUAGE_ID}/tStrings/${masterId}`);
  expect(getResponse.status).toBe(200);
  expect(getResponse.body[0]).toMatchObject({
    masterId,
    text: updatedTranslation,
    history: [firstTranslation],
  });
});
