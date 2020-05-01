import { TestPersistence } from "../../core/interfaces/Persistence";
import { ENGLISH_ID } from "../../core/models/Language";
import { DraftLessonString } from "../../core/models/LessonString";
import { TString } from "../../core/models/TString";
import { PGTestStorage } from "./PGStorage";
import testStorage from "./testStorage";
import { findBy, findByStrict } from "../../core/util/arrayUtils";
import { USE_PG } from "../testHelper";

let storage: TestPersistence;
storage = USE_PG ? new PGTestStorage() : testStorage;

beforeAll(async () => {
  await storage.reset();
});

afterAll(async () => {
  if (USE_PG) (storage as PGTestStorage).close();
});

test("Get languages", async () => {
  const languages = await storage.languages();
  expect(languages.length).toBe(3);
  const english = findByStrict(languages, "languageId", 1);
  expect(english).toMatchObject({
    name: "English",
    languageId: 1,
    code: "ABC",
    motherTongue: false,
    defaultSrcLang: 1
  });
  expect(english.progress[0]).toEqual({
    lessonId: 11,
    progress: 100
  });
});

test("Get language by id", async () => {
  const english = await storage.language({ languageId: ENGLISH_ID });
  expect(english).toMatchObject({
    name: "English",
    languageId: 1,
    code: "ABC",
    motherTongue: false
  });
  expect(english!.progress[0]).toEqual({
    lessonId: 11,
    progress: 100
  });
});

test("Get language by code", async () => {
  const batanga = await storage.language({ code: "GHI" });
  expect(batanga).toMatchObject({ name: "Batanga" });
});

test("Get language by missing", async () => {
  expect(await storage.language({ languageId: 4 })).toBeNull();
  expect(await storage.language({ code: "NOPE" })).toBeNull();
});

test("Create Language", async () => {
  const german = await storage.createLanguage({
    name: "German",
    defaultSrcLang: 2
  });
  expect(german).toMatchObject({
    motherTongue: true,
    name: "German",
    progress: [],
    defaultSrcLang: 2
  });
  expect(german.languageId).toBeGreaterThan(3);
  expect(german.code.length).toBeGreaterThan(3);

  await storage.reset();
});

test("Update Language", async () => {
  const batanga = await storage.updateLanguage(3, {
    motherTongue: false,
    defaultSrcLang: 2
  });
  expect(batanga).toMatchObject({
    languageId: 3,
    name: "Batanga",
    motherTongue: false,
    defaultSrcLang: 2
  });
  expect(batanga.progress[0]).toEqual({
    lessonId: 11,
    progress: 5 // Was 6
  });

  await storage.reset();
});

test("Invalid Code - valid", async () => {
  expect(await storage.invalidCode("GHI", [3, 3, 3])).toBe(false);
});

test("Invalid Code - nonexistant code", async () => {
  expect(await storage.invalidCode("NONE", [3, 3])).toBe(true);
});

test("Invalid code - does not match", async () => {
  expect(await storage.invalidCode("GHI", [2, 2, 2])).toBe(true);
  expect(await storage.invalidCode("GHI", [3, 3, 2])).toBe(true);
});

test("Get Lessons", async () => {
  const lessons = await storage.lessons();
  expect(lessons.length).toBe(5);
  expect(lessons[0]).toEqual({
    lessonId: 11,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 3
  });
});

test("Get Lessons by id", async () => {
  const lesson = await storage.lesson(12);
  expect(lesson).toMatchObject({
    lessonId: 12,
    book: "Luke",
    series: 1,
    lesson: 2,
    version: 3
  });
  expect(lesson!.lessonStrings.length).toBe(280);
  expect(lesson!.lessonStrings).toContainEqual({
    lessonId: 12,
    lessonStringId: 580,
    lessonVersion: 3,
    masterId: 340,
    motherTongue: false,
    type: "content",
    xpath:
      "/office:document-content/office:body/office:text/table:table[1]/table:table-row/table:table-cell[1]/text:p/text()"
  });
});

test("Get missing Lesson", async () => {
  expect(await storage.lesson(16)).toBeNull();
});

test("Create Lesson", async () => {
  const lesson = await storage.createLesson({
    book: "Luke",
    series: 1,
    lesson: 6
  });
  expect(lesson).toMatchObject({
    book: "Luke",
    series: 1,
    lesson: 6,
    version: 0
  });
  expect(lesson.lessonId).toBeGreaterThan(15);

  // PROGRESS
  const english = await storage.language({ languageId: ENGLISH_ID });
  expect(english!.progress.length).toBe(5); // The new one doesn't count since it has no strings

  await storage.reset();
});

test("Update Lesson", async () => {
  const draftLessonStrings: DraftLessonString[] = [
    {
      masterId: 4,
      lessonId: 11,
      type: "content",
      xpath: "some:/xpath",
      motherTongue: true
    },
    {
      masterId: 342,
      lessonId: 11,
      type: "content",
      xpath: "some:/more/xpath",
      motherTongue: false
    }
  ];

  const lesson = await storage.updateLesson(11, 4, draftLessonStrings);
  expect(lesson).toMatchObject({
    lessonId: 11,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 4
  });
  expect(lesson.lessonStrings.length).toBe(2);
  draftLessonStrings.forEach((ds, index) =>
    expect(lesson.lessonStrings[index]).toMatchObject(ds)
  );

  await timeout(100);
  // Progress
  const batanga = await storage.language({ languageId: 3 });
  expect(batanga!.progress).toContainEqual({
    lessonId: 11,
    progress: 100
  });

  await storage.reset();
});

test("Get TStrings by Language", async () => {
  const batangaStrings = await storage.tStrings({ languageId: 3 });
  expect(batangaStrings.length).toBe(4);
  expect(batangaStrings[0]).toMatchObject({
    masterId: 1,
    languageId: 3,
    history: [],
    source: "Le livre de Luc et la naissance de Jean Baptiste",
    sourceLanguageId: 2,
    text: "Pɔh eyamu ya Lukasi etilinɔ na iyabɛnɛ dá Yohanesi Nkahɛdɛni"
  });
});

test("Get TStrings by nonexistant language", async () => {
  expect((await storage.tStrings({ languageId: 4 })).length).toBe(0);
});

test("Get TStrings by language and lesson", async () => {
  const less1BatStrings = await storage.tStrings({
    languageId: 3,
    lessonId: 11
  });
  expect(less1BatStrings.length).toBe(3);
});

test("English Scripture tStrings", async () => {
  const engStrings = await storage.englishScriptureTStrings();
  expect(engStrings.length).toBe(60);
  expect(engStrings[0].text).toMatch(/^Luke .+/);
  // expect(engStrings.map(s => s.text)).toEqual([]); // For visual inspection
});

test("Save TStrings", async () => {
  const newTStrings: TString[] = [
    {
      masterId: 1,
      source: "Livre de Luc...",
      text: "Luke's Book"
    },
    { masterId: 3, source: "Dieu entend...", text: "" },
    {
      masterId: 19,
      source: "Luc 1:13...",
      text: "Bt Luke 1:13..."
    }
  ].map(tStr => ({ ...tStr, history: [], sourceLanguageId: 2, languageId: 3 }));

  let batanga = await storage.language({ languageId: 3 });
  expect(batanga!.progress[0]).toEqual({ lessonId: 11, progress: 6 });
  const tStrings = await storage.saveTStrings(newTStrings, {
    awaitProgress: true
  });
  expect(tStrings.length).toBe(3);
  expect(tStrings[0]).toEqual({
    masterId: 1,
    source: "Livre de Luc...",
    text: "Luke's Book",
    history: ["Pɔh eyamu ya Lukasi etilinɔ na iyabɛnɛ dá Yohanesi Nkahɛdɛni"],
    sourceLanguageId: 2,
    languageId: 3
  });
  expect(tStrings[1]).toEqual({
    masterId: 3,
    source: "Dieu entend...",
    text: "",
    history: ["Njambɛ abowandi mahaleya mahu."],
    sourceLanguageId: 2,
    languageId: 3
  });
  expect(tStrings[2]).toEqual({
    masterId: 19,
    source: "Luc 1:13...",
    text: "Bt Luke 1:13...",
    history: [],
    sourceLanguageId: 2,
    languageId: 3
  });

  batanga = await storage.language({ languageId: 3 });
  expect(batanga!.progress[0]).toEqual({ lessonId: 11, progress: 4 });

  await storage.reset();
});

test("Save TStrings progress", async () => {
  const engScripStrs = await storage.englishScriptureTStrings();
  const batScripStrs: TString[] = engScripStrs.map(eng => ({
    masterId: eng.masterId,
    languageId: 3,
    text: `Batange: ${eng.text}`,
    history: []
  }));
  const tStrings = await storage.saveTStrings(batScripStrs, {
    awaitProgress: true
  });
  expect(tStrings.length).toBe(batScripStrs.length);
  const batanga = await storage.language({ languageId: 3 });
  expect(batanga!.progress[0]).toEqual({ lessonId: 11, progress: 23 }); // Was 6

  await storage.reset();
});

test("Add or Find Master Strings", async () => {
  expect((await storage.tStrings({ languageId: ENGLISH_ID })).length).toBe(654);
  const tStrings = await storage.addOrFindMasterStrings([
    "The Book of Luke and the Birth of John the Baptizer",
    "Pizza is Tasty!"
  ]);
  expect(tStrings[0]).toMatchObject({
    languageId: 1,
    masterId: 1,
    text: "The Book of Luke and the Birth of John the Baptizer",
    history: []
  });
  expect(tStrings[1]).toMatchObject({
    languageId: 1,
    text: "Pizza is Tasty!",
    history: []
  });
  expect(tStrings[1].masterId).toBeGreaterThan(653);
  expect((await storage.tStrings({ languageId: ENGLISH_ID })).length).toBe(655);

  // await storage.reset()
});

function timeout(ms: number) {
  return new Promise((res, _) => {
    setTimeout(res, ms);
  });
}
