import * as Manifest from "../../src/util/Manifest";
import { resetTestStorage } from "../testHelper";

const timestamp = 1554731812624;

beforeAll(() => {
  resetTestStorage();
});

test("Add new lesson version", () => {
  const lessonId = {
    language: "English",
    lesson: "Q1-L01",
    version: timestamp
  };
  Manifest.addSourceLesson(lessonId);
  const manifest = Manifest.readSourceManifest();
  expect(manifest.length).toBe(1);
  expect(manifest[0].lessons.length).toBe(1);
  expect(manifest[0].lessons[0].versions.length).toBe(2);
  expect(manifest[0].lessons[0].versions[1]).toEqual({
    version: timestamp,
    projects: []
  });
});

test("Add new lesson", () => {
  const lessonId = {
    language: "English",
    lesson: "Q1-L02",
    version: timestamp
  };
  Manifest.addSourceLesson(lessonId);
  const manifest = Manifest.readSourceManifest();
  expect(manifest.length).toBe(1);
  expect(manifest[0].lessons.length).toBe(2);
  expect(manifest[0].lessons[1]).toEqual({
    lesson: "Q1-L02",
    versions: [{ version: timestamp, projects: [] }]
  });
});

test("Add new language", () => {
  const lessonId = {
    language: "French",
    lesson: "Q1-L01",
    version: timestamp
  };
  Manifest.addSourceLesson(lessonId);
  const manifest = Manifest.readSourceManifest();
  expect(manifest.length).toBe(2);
  expect(manifest[1]).toEqual({
    language: "French",
    lessons: [
      {
        lesson: "Q1-L01",
        versions: [{ version: timestamp, projects: [] }]
      }
    ],
    projects: []
  });
});
