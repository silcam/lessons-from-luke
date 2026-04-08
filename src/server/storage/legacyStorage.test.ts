/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { legacyProjects, legacyTStrings } from "./legacyStorage";
import { mkdirSafe, unlinkRecursive } from "../../core/util/fsUtils";

const stringsDir = path.join(process.cwd(), "strings");
const projectsJsonPath = path.join(stringsDir, "projects.json");
const translationsDir = path.join(stringsDir, "translations");
const projectDir = path.join(translationsDir, "TestLanguage_1234567890");

const mockProjects = [
  {
    targetLang: "TestLanguage",
    datetime: 1234567890,
    lockCode: "ABC",
    sourceLang: "Français"
  },
  {
    targetLang: "OtherLang",
    datetime: 9999999999,
    lockCode: "DEF",
    sourceLang: "English"
  }
];

const mockTStrings = [
  { xpath: "/a/b/c", src: "Bonjour le monde", targetText: "Hello World" },
  { xpath: "/a/b/d", src: "Au revoir", targetText: "" }, // empty — should be filtered out
  { xpath: "/a/b/e", src: "Luc 1:1 Scripture", targetText: "Luke 1:1 Scripture" }
];

beforeAll(() => {
  mkdirSafe(stringsDir);
  mkdirSafe(translationsDir);
  mkdirSafe(projectDir);
  fs.writeFileSync(projectsJsonPath, JSON.stringify(mockProjects));
  fs.writeFileSync(
    path.join(projectDir, "lesson1.json"),
    JSON.stringify(mockTStrings)
  );
  // Create a non-json file to test the endsWith(".json") branch
  fs.writeFileSync(path.join(projectDir, "readme.txt"), "not a json file");
});

afterAll(() => {
  unlinkRecursive(stringsDir);
});

describe("legacyProjects", () => {
  test("returns only projects with Français source language", () => {
    const projects = legacyProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].sourceLang).toBe("Français");
    expect(projects[0].targetLang).toBe("TestLanguage");
  });
});

describe("legacyTStrings", () => {
  test("returns non-empty tStrings from project directory", () => {
    const projects = legacyProjects();
    const tStrings = legacyTStrings(projects[0]);
    // Should include strings with non-empty targetText
    expect(tStrings.length).toBe(2);
    expect(tStrings[0].src).toBe("Bonjour le monde");
    expect(tStrings[0].targetText).toBe("Hello World");
  });

  test("filters out tStrings with empty targetText", () => {
    const projects = legacyProjects();
    const tStrings = legacyTStrings(projects[0]);
    expect(tStrings.find(t => t.targetText === "")).toBeUndefined();
  });

  test("skips non-json files in project directory", () => {
    const projects = legacyProjects();
    const tStrings = legacyTStrings(projects[0]);
    // readme.txt should be ignored, only 2 non-empty entries from lesson1.json
    expect(tStrings.length).toBe(2);
  });
});
