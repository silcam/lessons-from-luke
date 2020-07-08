/// <reference types="jest" />

import { plainAgent, resetStorage, closeStorage } from "../testHelper";
import { TString } from "../../core/models/TString";
import { SuperTest } from "supertest";
import supertest = require("supertest");
import { WithCode } from "../../core/models/Language";
import { unset } from "../../core/util/objectUtils";

afterAll(closeStorage);

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
    lessonStringId: null
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
    lessonStringId: null
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
        history: []
      }
    ],
    code: "WRONG"
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
    history: []
  };
  expect.assertions(4);
  const agent = plainAgent();
  expect(await batangaTStringCount(agent)).toBe(3);
  const response = await agent
    .post("/api/tStrings")
    .send({ tStrings: [tString], code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual(tString);
  expect(await batangaTStringCount(agent)).toBe(4);

  await resetStorage();
});

test("Save TString - updated string", async () => {
  const tStrings = [
    {
      masterId: 3,
      languageId: 3,
      text: "sreyarp ruo sraeh doG",
      source: "God hears our prayers.",
      sourceLanguageId: 1,
      history: []
    }
  ];
  expect.assertions(4);
  const agent = plainAgent();
  expect(await batangaTStringCount(agent)).toBe(3);
  const response = await agent
    .post("/api/tStrings")
    .send({ tStrings, code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    ...tStrings[0],
    history: ["Njambɛ abowandi mahaleya mahu."]
  });
  expect(await batangaTStringCount(agent)).toBe(3);

  await resetStorage();
});

test("Save TString - blank text", async () => {
  const tStrings: TString[] = [
    {
      masterId: 3,
      languageId: 3,
      text: "",
      history: []
    }
  ];
  expect.assertions(4);
  const agent = plainAgent();
  expect(await batangaTStringCount(agent)).toBe(3);
  const response = await agent
    .post("/api/tStrings")
    .send({ tStrings, code: "GHI" });
  expect(response.status).toBe(200);
  expect(response.body[0]).toEqual({
    ...tStrings[0],
    history: ["Njambɛ abowandi mahaleya mahu."]
  });
  expect(await batangaTStringCount(agent)).toBe(3);

  await resetStorage();
});

// test("Save TString - Exception to Master", async () => {
//   const tString: WithCode<TString> = {
//     masterId: 3,
//     languageId: 3,
//     text: "Again, Njambɛ abowandi mahaleya mahu.",
//     source: "Dieu entend nos prières.",
//     sourceLanguageId: 2,
//     history: [],
//     lessonStringId: 5,
//     code: "GHI"
//   };
//   expect.assertions(4);
//   const agent = plainAgent();
//   expect(await batangaTStringCount(agent)).toBe(3);
//   let response = await agent.post("/api/tStrings").send(tString);
//   expect(response.status).toBe(200);
//   expect(response.body).toEqual(unset(tString, "code"));
//   expect(await batangaTStringCount(agent)).toBe(4);
// });

async function batangaTStringCount(
  agent: SuperTest<supertest.Test>
): Promise<number> {
  const response = await agent.get("/api/languages/3/lessons/11/tStrings");
  return response.body.length;
}
