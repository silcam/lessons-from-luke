import * as Manifest from "../../src/util/Manifest";
import { resetTestStorage } from "../testHelper";
import MockDate from "mockdate";

beforeAll(() => {
  MockDate.set(1554891104714);
});

afterAll(() => {
  MockDate.reset();
});

beforeEach(() => {
  resetTestStorage();
});

test("Add new lesson version", () => {
  Manifest.addSourceLesson("English", "Luke-Q1-L01");
  const manifest = Manifest.readSourceManifest();
  expect(manifest.length).toBe(1);
  expect(manifest[0].lessons.length).toBe(1);
  expect(manifest[0].lessons[0].versions.length).toBe(2);
  expect(manifest[0].lessons[0].versions[1]).toEqual({
    version: 2,
    projects: []
  });
});

test("Add new lesson", () => {
  Manifest.addSourceLesson("English", "Luke-Q1-L02");
  const manifest = Manifest.readSourceManifest();
  expect(manifest.length).toBe(1);
  expect(manifest[0].lessons.length).toBe(2);
  expect(manifest[0].lessons[1]).toEqual({
    lesson: "Luke-Q1-L02",
    versions: [{ version: 1, projects: [] }]
  });
});

test("Add new language", () => {
  Manifest.addSourceLanguage("Français");
  const manifest = Manifest.readSourceManifest();
  expect(manifest.length).toBe(2);
  expect(manifest[1]).toEqual({
    language: "Français",
    lessons: [],
    projects: []
  });
});

test("Add new project", () => {
  Manifest.addProject("English", "Lingala");
  expect(Manifest.readSourceManifest()).toEqual([
    {
      language: "English",
      lessons: [
        {
          lesson: "Luke-Q1-L01",
          versions: [
            {
              projects: ["Pidgin_1555081479425", "Lingala_1554891104714"],
              version: 1
            }
          ]
        }
      ],
      projects: ["Pidgin_1555081479425", "Lingala_1554891104714"]
    }
  ]);
  expect(Manifest.readProjectManifest(1554891104714)).toEqual({
    datetime: 1554891104714,
    lessons: [{ lesson: "Luke-Q1-L01", version: 1 }],
    sourceLang: "English",
    targetLang: "Lingala"
  });
});
