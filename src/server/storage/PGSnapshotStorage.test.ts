/// <reference types="jest" />

import PGSnapshotStorage, {
  SnapshotIsReadOnlyError,
  redactConnectionUrl,
} from "./PGSnapshotStorage";

// postgres.js connects lazily — constructing against a URL that points at
// nothing never opens a socket, so these are pure unit tests: no live
// database required, and no query ever actually runs against it.
const FAKE_SNAPSHOT_URL = "postgres://snapshotuser:hunter2@127.0.0.1:59999/snapshotdb";

describe("PGSnapshotStorage mutating methods throw before touching the database", () => {
  const storage = new PGSnapshotStorage(FAKE_SNAPSHOT_URL);

  test("createLanguage throws", async () => {
    await expect(storage.createLanguage({ name: "X", defaultSrcLang: 1 } as any)).rejects.toThrow(
      SnapshotIsReadOnlyError
    );
  });

  test("updateLanguage throws", async () => {
    await expect(storage.updateLanguage(1, { name: "X" })).rejects.toThrow(SnapshotIsReadOnlyError);
  });

  test("updateLanguageChecked throws", async () => {
    await expect(storage.updateLanguageChecked(1, { name: "X" })).rejects.toThrow(
      SnapshotIsReadOnlyError
    );
  });

  test("archiveLanguage throws", async () => {
    await expect(storage.archiveLanguage(1)).rejects.toThrow(SnapshotIsReadOnlyError);
  });

  test("createLesson throws", async () => {
    await expect(
      storage.createLesson({ book: "Luke", series: 1, lesson: 1 } as any)
    ).rejects.toThrow(SnapshotIsReadOnlyError);
  });

  test("updateLesson throws", async () => {
    await expect(storage.updateLesson(1, 1, [])).rejects.toThrow(SnapshotIsReadOnlyError);
  });

  test("addOrFindMasterStrings throws", async () => {
    await expect(storage.addOrFindMasterStrings(["hello"])).rejects.toThrow(
      SnapshotIsReadOnlyError
    );
  });

  test("saveTStrings throws", async () => {
    await expect(storage.saveTStrings([])).rejects.toThrow(SnapshotIsReadOnlyError);
  });

  test("updateProgress throws", async () => {
    await expect(storage.updateProgress()).rejects.toThrow(SnapshotIsReadOnlyError);
  });

  test("thrown errors identify which method was called", async () => {
    await expect(storage.updateProgress()).rejects.toThrow(/updateProgress/);
  });
});

describe("PGSnapshotStorage read methods still delegate to the real query", () => {
  test("languages() runs a query through this.sql, not a throwing override", async () => {
    const storage = new PGSnapshotStorage(FAKE_SNAPSHOT_URL);
    const fakeRows = [{ languageId: 1, name: "English" }];
    const sqlMock = jest.fn().mockResolvedValue(fakeRows);
    (storage as any).sql = sqlMock;

    const result = await storage.languages();

    expect(sqlMock).toHaveBeenCalled();
    expect(result).toEqual(fakeRows);
  });

  test("lesson() still delegates through this.sql for a read", async () => {
    const storage = new PGSnapshotStorage(FAKE_SNAPSHOT_URL);
    const sqlMock = jest.fn().mockResolvedValue([]);
    (storage as any).sql = sqlMock;

    const result = await storage.lesson(1);

    expect(sqlMock).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe("redactConnectionUrl", () => {
  test("redacts the password out of a well-formed connection URL", () => {
    expect(redactConnectionUrl(FAKE_SNAPSHOT_URL)).toBe(
      "postgres://snapshotuser:***@127.0.0.1:59999/snapshotdb"
    );
  });

  test("never leaks the raw input when the URL fails to parse", () => {
    const garbage = "not a url, but maybe a password: hunter2";
    const redacted = redactConnectionUrl(garbage);
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain(garbage);
  });
});
