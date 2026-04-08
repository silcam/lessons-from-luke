/// <reference types="jest" />

import fs from "fs";
import path from "path";
import { loggedInAgent } from "../testHelper";
import { mkdirSafe, unlinkRecursive } from "../../core/util/fsUtils";

jest.setTimeout(60000);

const stringsDir = path.join(process.cwd(), "strings");

describe("migrationController with mock legacy data", () => {
  beforeAll(() => {
    const projectsJsonPath = path.join(stringsDir, "projects.json");
    const translationsDir = path.join(stringsDir, "translations");
    const projectDir = path.join(translationsDir, "TestLang_1000000000");
    // Project with no translations directory — legacyTStrings throws, triggering the 500 path
    const badProjectDir = path.join(translationsDir, "BadLang_2000000000");

    mkdirSafe(stringsDir);
    mkdirSafe(translationsDir);
    mkdirSafe(projectDir);
    // badProjectDir intentionally NOT created — readdirSync will throw without a status field
    fs.writeFileSync(projectsJsonPath, JSON.stringify([
      { targetLang: "TestLang", datetime: 1000000000, lockCode: "XYZ", sourceLang: "Fran\u00e7ais" },
      { targetLang: "BadLang", datetime: 2000000000, lockCode: "ERR", sourceLang: "Fran\u00e7ais" }
    ]));
    // Mix of scripture (filtered by stripScripture), exact match, and best-match strings.
    // The test DB has only 5 French tStrings so compareTwoStrings is fast even under QEMU.
    fs.writeFileSync(path.join(projectDir, "lesson.json"), JSON.stringify([
      { xpath: "/a/b/c", src: "Luc 1:1 Le livre de Luc", targetText: "Luke 1:1 text" },
      { xpath: "/a/b/d", src: "Luc 2:3 Other verse", targetText: "Other target" },
      // Exact match with French tString (masterid=1)
      { xpath: "/a/b/e", src: "Le livre de Luc et la naissance de Jean Baptiste", targetText: "The book of Luke" },
      // Non-matching string with punctuation — exercises bestMatches punctuation branch (true)
      { xpath: "/a/b/f", src: "Bonjour le monde.", targetText: "Hello World" },
      // Non-matching string without punctuation — exercises bestMatches punctuation branch (false)
      { xpath: "/a/b/g", src: "Bonsoir", targetText: "Good evening" }
    ]));
  });

  afterAll(() => {
    unlinkRecursive(stringsDir);
  });

  test("GET /api/admin/legacy/projects returns French-sourced projects", async () => {
    const agent = await loggedInAgent();
    const response = await agent.get("/api/admin/legacy/projects");
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
  });

  test("GET /api/admin/legacy/project/:datetime returns exact and best-matched strings", async () => {
    const agent = await loggedInAgent();
    const response = await agent.get("/api/admin/legacy/project/1000000000");
    expect(response.status).toBe(200);
    // Scripture strings are stripped, leaving 1 exact match and 2 best-matches
    expect(response.body.exactLegacyStrings.length).toBe(1);
    expect(response.body.exactLegacyStrings[0].src).toBe("Le livre de Luc et la naissance de Jean Baptiste");
    expect(response.body.legacyStrings.length).toBe(2);
  });

  test("GET /api/admin/legacy/project/:datetime returns 500 when project dir missing", async () => {
    const agent = await loggedInAgent();
    // BadLang project exists in projects.json but its translations directory does not —
    // legacyTStrings throws a native Error (no status field), triggering the 500 path
    const response = await agent.get("/api/admin/legacy/project/2000000000");
    expect(response.status).toBe(500);
  });

  test("GET /api/admin/legacy/project/:datetime returns 404 for non-existent project", async () => {
    const agent = await loggedInAgent();
    const response = await agent.get("/api/admin/legacy/project/9999999999");
    expect(response.status).toBe(404);
  });
});
