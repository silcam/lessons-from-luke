/// <reference types="jest" />

import PGRestoreLessonGatewayStorage from "./PGRestoreLessonGatewayStorage";

// Fixture baseline (test/fixtures-0.json, loaded once by jestGlobalSetup):
//   - languages 1 (English), 2 (Français), 3 (Batanga) — none archived
//   - lesson 11 = Luke 1-1; its lessonStrings reference masterId 1 (among others)
//   - lesson 12 = Luke 1-2
//   - tStrings has exactly one (masterId=1, languageId=1) row, lessonStringId NULL
function sql() {
  return (global as any).testStorage.sql;
}

function gateway(): PGRestoreLessonGatewayStorage {
  return new PGRestoreLessonGatewayStorage(sql());
}

describe("fetchAllLanguages", () => {
  test("includeArchived=true returns archived languages too", async () => {
    await sql()`INSERT INTO languages (name, code, motherTongue, progress, archived)
                 VALUES ('Retired Tongue', 'ret', false, '[]', true)`;

    const all = await gateway().fetchAllLanguages(true);
    const archivedOnes = await gateway().fetchAllLanguages(false);

    expect(all.some((l) => l.name === "Retired Tongue")).toBe(true);
    expect(archivedOnes.some((l) => l.name === "Retired Tongue")).toBe(false);
    // Active languages still present in the unfiltered read too.
    expect(all.some((l) => l.languageId === 1)).toBe(true);
  });
});

describe("fetchTStringsForLesson", () => {
  test("returns rows scoped by masterId regardless of language archived state", async () => {
    await sql()`UPDATE languages SET archived=true WHERE languageid=3`;

    const rows = await gateway().fetchTStringsForLesson(11, [1], {
      includeLegacyLessonStringScoped: false,
    });

    expect(rows.some((r) => r.masterId === 1 && r.languageId === 1)).toBe(true);
  });

  test("includeLegacyLessonStringScoped pulls in rows keyed by lessonStringId even when masterId is not requested", async () => {
    // A legacy row scoped to one of lesson 11's lessonStringIds (7), with a
    // masterId (999) deliberately absent from the requested masterIds list —
    // exactly the orphan vector this option exists to surface.
    const [legacyLessonString] =
      await sql()`SELECT lessonstringid FROM lessonstrings WHERE lessonid=11 LIMIT 1`;
    await sql()`INSERT INTO tstrings (masterid, languageid, text, history, lessonstringid)
                 VALUES (999, 1, 'legacy scoped text', '[]', ${legacyLessonString.lessonStringId})`;

    const withoutLegacy = await gateway().fetchTStringsForLesson(11, [1], {
      includeLegacyLessonStringScoped: false,
    });
    const withLegacy = await gateway().fetchTStringsForLesson(11, [1], {
      includeLegacyLessonStringScoped: true,
    });

    expect(withoutLegacy.some((r) => r.masterId === 999)).toBe(false);
    expect(withLegacy.some((r) => r.masterId === 999 && r.text === "legacy scoped text")).toBe(
      true
    );
  });

  test("de-dupes a row that matches both the masterId and legacy predicates", async () => {
    const rows = await gateway().fetchTStringsForLesson(11, [1], {
      includeLegacyLessonStringScoped: true,
    });
    const matches = rows.filter((r) => r.masterId === 1 && r.languageId === 1);
    expect(matches).toHaveLength(1);
  });
});

describe("fetchLegacyScopedCount", () => {
  test("counts tStrings rows with a non-null lessonStringId, globally", async () => {
    const before = await gateway().fetchLegacyScopedCount();

    const [legacyLessonString] =
      await sql()`SELECT lessonstringid FROM lessonstrings WHERE lessonid=11 LIMIT 1`;
    await sql()`INSERT INTO tstrings (masterid, languageid, text, history, lessonstringid)
                 VALUES (998, 2, 'legacy row', '[]', ${legacyLessonString.lessonStringId})`;

    const after = await gateway().fetchLegacyScopedCount();
    expect(after).toBe(before + 1);
  });
});

describe("fetchLessonByBookSeriesLesson", () => {
  test("returns the lesson row for a known (book, series, lesson)", async () => {
    const lesson = await gateway().fetchLessonByBookSeriesLesson("Luke", 1, 1);
    expect(lesson).toMatchObject({ lessonId: 11, book: "Luke", series: 1, lesson: 1 });
  });

  test("returns null for an unknown (book, series, lesson)", async () => {
    const lesson = await gateway().fetchLessonByBookSeriesLesson("Luke", 999, 999);
    expect(lesson).toBeNull();
  });

  test("includes the lesson's modified timestamp for incident dating", async () => {
    await sql()`UPDATE lessons SET modified=${1786700000000} WHERE book='Luke' AND series=1 AND lesson=1`;
    const lesson = await gateway().fetchLessonByBookSeriesLesson("Luke", 1, 1);
    expect(lesson?.modified).toBe(1786700000000);
  });
});

describe("fetchDuplicateRowSweep", () => {
  test("finds rows sharing (languageId, masterId, lessonStringId) more than once", async () => {
    // Fixtures already hold one (masterId=1, languageId=1, lessonStringId=NULL)
    // row; add a second so the pair collides.
    await sql()`INSERT INTO tstrings (masterid, languageid, text, history)
                 VALUES (1, 1, 'duplicate text', '[]')`;

    const dupes = await gateway().fetchDuplicateRowSweep([1]);

    const match = dupes.find((d) => d.languageId === 1 && d.masterId === 1);
    expect(match).toBeDefined();
    expect(match!.rowCount).toBe(2);
    expect(match!.texts.length).toBe(2);
  });

  test("returns [] when no master IDs are given", async () => {
    expect(await gateway().fetchDuplicateRowSweep([])).toEqual([]);
  });

  test("omits rows with no duplicate", async () => {
    const dupes = await gateway().fetchDuplicateRowSweep([2]);
    expect(dupes.find((d) => d.masterId === 2)).toBeUndefined();
  });
});

describe("fetchLessonsSharingMasterIds", () => {
  test("returns every lesson referencing a shared masterId, unfiltered", async () => {
    // masterId 1 already belongs to lesson 11 via fixtures; link it to lesson
    // 12 as well so it becomes genuinely shared.
    await sql()`INSERT INTO lessonstrings (masterid, lessonid, lessonversion, type, xpath, mothertongue)
                 VALUES (1, 12, 3, 'content', '/fake/xpath', false)`;

    const [entry] = await gateway().fetchLessonsSharingMasterIds([1]);

    expect(entry.masterId).toBe(1);
    expect(entry.lessons).toEqual(
      expect.arrayContaining([
        { book: "Luke", series: 1, lesson: 1 },
        { book: "Luke", series: 1, lesson: 2 },
      ])
    );
  });

  test("returns [] when no master IDs are given", async () => {
    expect(await gateway().fetchLessonsSharingMasterIds([])).toEqual([]);
  });
});
