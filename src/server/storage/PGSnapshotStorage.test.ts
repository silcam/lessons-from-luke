/// <reference types="jest" />

import PGSnapshotStorage, {
  SnapshotIsReadOnlyError,
  redactConnectionUrl,
  snapshotDbConnect,
  snapshotUrlSecurityWarning,
} from "./PGSnapshotStorage";
import secrets from "../util/secrets";

// postgres.js connects lazily — constructing against a URL that points at
// nothing never opens a socket, so these are pure unit tests: no live
// database required, and no query ever actually runs against it.
const FAKE_SNAPSHOT_URL = "postgres://snapshotuser:hunter2@127.0.0.1:59999/snapshotdb";

/**
 * `PGSnapshotStorage`'s constructor takes an already-connected `SqlFunc`
 * (amkj.15 — it extends `PGRestoreLessonGatewayStorage`, following that
 * class's "subclass, then swap `this.sql`" pattern, rather than opening its
 * own connection from a URL). A `jest.fn()` recording mock stands in for the
 * connection so these tests can assert not just that a throwing override
 * rejects, but that it never even calls into `this.sql` (guard 1 fires
 * synchronously, before any query executes).
 */
function fakeSqlFunc(): jest.Mock {
  return jest.fn().mockResolvedValue([]);
}

describe("PGSnapshotStorage mutating methods throw before touching the database", () => {
  test("createLanguage throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.createLanguage({ name: "X", defaultSrcLang: 1 } as any)).rejects.toThrow(
      SnapshotIsReadOnlyError
    );
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("updateLanguage throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.updateLanguage(1, { name: "X" })).rejects.toThrow(SnapshotIsReadOnlyError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("updateLanguageChecked throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.updateLanguageChecked(1, { name: "X" })).rejects.toThrow(
      SnapshotIsReadOnlyError
    );
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("archiveLanguage throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.archiveLanguage(1)).rejects.toThrow(SnapshotIsReadOnlyError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("createLesson throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(
      storage.createLesson({ book: "Luke", series: 1, lesson: 1 } as any)
    ).rejects.toThrow(SnapshotIsReadOnlyError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("updateLesson throws and issues no query (acceptance criterion)", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.updateLesson(1, 1, [])).rejects.toThrow(SnapshotIsReadOnlyError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("addOrFindMasterStrings throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.addOrFindMasterStrings(["hello"])).rejects.toThrow(
      SnapshotIsReadOnlyError
    );
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("saveTStrings throws and issues no query (acceptance criterion)", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.saveTStrings([])).rejects.toThrow(SnapshotIsReadOnlyError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("updateProgress throws and issues no query", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.updateProgress()).rejects.toThrow(SnapshotIsReadOnlyError);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  test("thrown errors identify which method was called", async () => {
    const sqlMock = fakeSqlFunc();
    const storage = new PGSnapshotStorage(sqlMock as any);
    await expect(storage.updateProgress()).rejects.toThrow(/updateProgress/);
  });
});

describe("PGSnapshotStorage read methods still delegate to the real query", () => {
  test("languages() runs a query through this.sql, not a throwing override", async () => {
    const fakeRows = [{ languageId: 1, name: "English" }];
    const sqlMock = jest.fn().mockResolvedValue(fakeRows);
    const storage = new PGSnapshotStorage(sqlMock as any);

    const result = await storage.languages();

    expect(sqlMock).toHaveBeenCalled();
    expect(result).toEqual(fakeRows);
  });

  test("lesson() still delegates through this.sql for a read", async () => {
    const sqlMock = jest.fn().mockResolvedValue([]);
    const storage = new PGSnapshotStorage(sqlMock as any);

    const result = await storage.lesson(1);

    expect(sqlMock).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  test("fetchAllLanguages() — the gateway read method restoreLesson's CLI needs — delegates through this.sql", async () => {
    const fakeRows = [{ languageid: 1, name: "English", archived: false }];
    const sqlMock = jest.fn().mockResolvedValue(fakeRows);
    const storage = new PGSnapshotStorage(sqlMock as any);

    const result = await storage.fetchAllLanguages(true);

    expect(sqlMock).toHaveBeenCalled();
    expect(result).toEqual(fakeRows);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// snapshotDbConnect() — real Postgres session, second independent guard
//
// The class-level `throw before querying` guards above never touch a real
// socket. This proves the second guard (`default_transaction_read_only =
// on`, sent as a startup parameter by `snapshotDbConnect`) actually holds
// at the Postgres session level: even a raw SQL write issued directly
// through the connection (bypassing every `Persistence` method override)
// is rejected by Postgres itself, not merely by application code.
// ─────────────────────────────────────────────────────────────────────────

describe("snapshotDbConnect() real connection is read-only at the Postgres session level", () => {
  test("an INSERT issued directly through the connection is rejected by Postgres", async () => {
    const { database, username, password } = secrets.testDb;
    const host = (secrets.testDb as unknown as { host?: string }).host ?? "localhost";
    const url = `postgres://${username}:${password}@${host}/${database}`;
    const sql = snapshotDbConnect(url);
    try {
      await expect(
        sql`INSERT INTO languages (name, defaultsrclang) VALUES ('should-not-insert', 1)`
      ).rejects.toThrow(/read-only transaction/i);
    } finally {
      await (sql as unknown as { end: () => Promise<void> }).end();
    }
  });

  test("an UPDATE issued directly through the connection is rejected by Postgres", async () => {
    const { database, username, password } = secrets.testDb;
    const host = (secrets.testDb as unknown as { host?: string }).host ?? "localhost";
    const url = `postgres://${username}:${password}@${host}/${database}`;
    const sql = snapshotDbConnect(url);
    try {
      await expect(sql`UPDATE languages SET name = 'nope' WHERE languageid = 1`).rejects.toThrow(
        /read-only transaction/i
      );
    } finally {
      await (sql as unknown as { end: () => Promise<void> }).end();
    }
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

describe("snapshotUrlSecurityWarning", () => {
  test("warns on a non-loopback host with no sslmode; names the host, omits the password", () => {
    const warning = snapshotUrlSecurityWarning(
      "postgres://snapshotuser:hunter2@snapshot.example.com:5432/snapshotdb"
    );
    expect(warning).not.toBeNull();
    expect(warning).toContain("snapshot.example.com");
    expect(warning).not.toContain("hunter2");
  });

  test.each([
    ["127.0.0.1 loopback", "postgres://u:p@127.0.0.1:5433/db"],
    ["localhost loopback", "postgres://u:p@localhost:5433/db"],
    ["IPv6 loopback", "postgres://u:p@[::1]:5433/db"],
    [
      "non-loopback with sslmode=require",
      "postgres://u:p@snapshot.example.com:5432/db?sslmode=require",
    ],
    [
      "non-loopback with sslmode=verify-full",
      "postgres://u:p@snapshot.example.com:5432/db?sslmode=verify-full",
    ],
  ])("does not warn for %s", (_label, url) => {
    expect(snapshotUrlSecurityWarning(url)).toBeNull();
  });

  test("does not warn (fails closed, no warning) on an unparseable URL", () => {
    expect(snapshotUrlSecurityWarning("not a url")).toBeNull();
  });
});
