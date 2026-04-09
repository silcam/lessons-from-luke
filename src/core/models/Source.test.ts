/// <reference types="jest" />

import {
  sourceLessonIdToString,
  sourceLessonIdFromString,
  newSource,
  newSourceDoc,
  deleteLessonVersion,
  SourceLessonId
} from "./Source";

describe("sourceLessonIdToString", () => {
  test("converts a SourceLessonId to a string", () => {
    expect(
      sourceLessonIdToString({ language: "fr", lesson: "Luke-Q1-L01", version: 2 })
    ).toBe("fr_Luke-Q1-L01_2");
  });
});

describe("sourceLessonIdFromString", () => {
  test("parses a SourceLessonId from a string", () => {
    const result = sourceLessonIdFromString("fr_Luke-Q1-L01_2");
    expect(result.language).toBe("fr");
    expect(result.lesson).toBe("Luke-Q1-L01");
    expect(result.version).toBe(2);
  });

  test("roundtrips with sourceLessonIdToString", () => {
    const id: SourceLessonId = { language: "en", lesson: "Acts-Q2-L03", version: 1 };
    expect(sourceLessonIdFromString(sourceLessonIdToString(id))).toEqual(id);
  });
});

describe("newSource", () => {
  test("creates a source with the given language and empty lessons/projects", () => {
    const source = newSource("fr");
    expect(source.language).toBe("fr");
    expect(source.lessons).toEqual([]);
    expect(source.projects).toEqual([]);
  });
});

describe("newSourceDoc", () => {
  test("adds a new lesson version to an empty source", () => {
    const source = newSource("fr");
    const updated = newSourceDoc(source, "Luke-Q1-L01");
    expect(updated.lessons).toHaveLength(1);
    expect(updated.lessons[0].lesson).toBe("Luke-Q1-L01");
    expect(updated.lessons[0].versions).toHaveLength(1);
    expect(updated.lessons[0].versions[0].version).toBe(1);
  });

  test("adds a second version to an existing lesson", () => {
    const source = newSource("fr");
    const v1 = newSourceDoc(source, "Luke-Q1-L01");
    const v2 = newSourceDoc(v1, "Luke-Q1-L01");
    expect(v2.lessons[0].versions).toHaveLength(2);
    expect(v2.lessons[0].versions[1].version).toBe(2);
  });

  test("sorts lessons alphabetically when adding a new lesson", () => {
    const source = newSource("fr");
    const s1 = newSourceDoc(source, "Luke-Q2-L01");
    const s2 = newSourceDoc(s1, "Luke-Q1-L01");
    expect(s2.lessons[0].lesson).toBe("Luke-Q1-L01");
    expect(s2.lessons[1].lesson).toBe("Luke-Q2-L01");
  });

  test("adds a new lesson when lesson does not exist yet", () => {
    const source = newSource("fr");
    const s1 = newSourceDoc(source, "Luke-Q1-L01");
    const s2 = newSourceDoc(s1, "Luke-Q1-L02");
    expect(s2.lessons).toHaveLength(2);
  });
});

describe("deleteLessonVersion", () => {
  test("marks a version as deleted", () => {
    let source = newSource("fr");
    source = newSourceDoc(source, "Luke-Q1-L01");
    const lessonId: SourceLessonId = { language: "fr", lesson: "Luke-Q1-L01", version: 1 };
    const updated = deleteLessonVersion(source, lessonId);
    expect(updated.lessons[0].versions[0].deleted).toBe(true);
  });

  test("throws if the version has projects", () => {
    let source = newSource("fr");
    source = newSourceDoc(source, "Luke-Q1-L01");
    source = {
      ...source,
      lessons: [
        {
          ...source.lessons[0],
          versions: [{ ...source.lessons[0].versions[0], projects: ["proj1"] }]
        }
      ]
    };
    const lessonId: SourceLessonId = { language: "fr", lesson: "Luke-Q1-L01", version: 1 };
    expect(() => deleteLessonVersion(source, lessonId)).toThrow();
  });
});
