/// <reference types="jest" />

// Real cross-connection concurrency coverage for lessons-from-luke-fm4a.9's
// unique-index backstop (languages_name_active_lower_idx,
// migrations/1784766630015). See lessons-from-luke-fm4a.11.
//
// The controller-level "concurrent renames ... exactly one 200 and one 409"
// test in languagesController.test.ts runs both requests through
// global.testStorage (TransactionalTestStorage), which wraps every test in
// ONE transaction over a postgres({ max: 1 }) pool -- a single physical
// connection. Two agent.post() calls issued via Promise.all cannot interleave
// at the database level on that single connection: the first request's
// SAVEPOINT fully completes (including its UPDATE) before the second
// request's SAVEPOINT begins, so the second request's own duplicate-name
// SELECT ... FOR UPDATE finds the first rename already committed -- a normal
// duplicate hit via the app-level check, not the zero-row race window the
// unique index exists to close. That test still earns its keep (it proves
// the endpoint never returns two 200s), but it does NOT exercise the index
// backstop or mapUniqueViolationTo409's 23505 -> 409 mapping.
//
// This file uses two independent physical connections against the real test
// database -- bypassing TransactionalTestStorage and global.testStorage
// entirely -- to force that race deterministically, without relying on
// Promise.all timing:
//
//   A zero-row `SELECT ... FOR UPDATE` takes no lock, but a write that would
//   create a unique-index entry conflicting with another session's
//   UNCOMMITTED tuple BLOCKS (rather than erroring) until that other session
//   commits or rolls back -- then the waiter either succeeds or fails with
//   23505. We hold one connection's rename open (uncommitted) so the real
//   `updateLanguageChecked` call's own UPDATE is provably blocked (confirmed
//   via pg_stat_activity) before we release the holder, guaranteeing
//   `updateLanguageChecked` is the one that loses the race every run.
//
// If mapUniqueViolationTo409 is removed, the raw 23505 escapes instead of
// `{ status: 409 }`, and the assertion below fails. If
// languages_name_active_lower_idx is dropped, there is nothing to block or
// conflict on, updateLanguageChecked's UPDATE never waits (the
// pg_stat_activity poll below times out and fails the test), and both writes
// would succeed. The app-level FOR UPDATE duplicate-name check still runs
// throughout and still matches zero rows -- exactly the gap fm4a.9 closes.

import postgres from "postgres";
import { PGTestStorage, transformCol } from "./PGStorage";
import secrets from "../util/secrets";

const RACE_NAME = "Zero-Row Race Target Name";
const POLL_INTERVAL_MS = 20;
const POLL_TIMEOUT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("updateLanguageChecked: real cross-connection race toward a brand-new name", () => {
  let raw: ReturnType<typeof postgres>;
  let monitor: ReturnType<typeof postgres>;
  let storage: PGTestStorage;
  let originalName2: string;
  let originalName3: string;

  beforeAll(async () => {
    raw = postgres({ ...secrets.testDb, max: 1, transform: { column: transformCol } } as any);
    monitor = postgres({ ...secrets.testDb, max: 1, transform: { column: transformCol } } as any);
    storage = new PGTestStorage();
    // PGTestStorage's own pool defaults to postgres.js's multi-connection
    // pool (no `max` override), so back-to-back queries aren't guaranteed to
    // land on the same physical connection -- which would make the
    // pg_backend_pid() lookup below monitor the wrong backend. Replace it
    // with a single-connection pool so the pid we poll on is provably the
    // one updateLanguageChecked's UPDATE runs on, then end the original.
    const defaultPool = storage.sql;
    storage.sql = postgres({
      ...secrets.testDb,
      max: 1,
      transform: { column: transformCol },
    } as any) as any;
    await (defaultPool as any).end();

    const [lang2] = await raw`SELECT name FROM languages WHERE languageid = 2`;
    const [lang3] = await raw`SELECT name FROM languages WHERE languageid = 3`;
    originalName2 = lang2.name;
    originalName3 = lang3.name;
  });

  afterEach(async () => {
    // Every write in this file is a real committed write against the test
    // database -- it bypasses the per-test rollback transaction the rest of
    // the suite relies on -- so restore the fixture names by hand.
    await raw`UPDATE languages SET name = ${originalName2} WHERE languageid = 2`;
    await raw`UPDATE languages SET name = ${originalName3} WHERE languageid = 3`;
  });

  afterAll(async () => {
    await raw.end();
    await monitor.end();
    await storage.close();
  });

  test("the real updateLanguageChecked UPDATE blocks on another session's uncommitted conflicting name, then loses with 409", async () => {
    let holderReady!: () => void;
    let releaseHolder!: () => void;
    const holderReadyPromise = new Promise<void>((resolve) => {
      holderReady = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });

    // Session R: rename language 3 to the race target name, but hold the
    // transaction open (uncommitted) until the outer test says so.
    const held = raw.begin(async (tx) => {
      await tx`UPDATE languages SET name = ${RACE_NAME} WHERE languageid = 3`;
      holderReady();
      await releasePromise;
    });

    await holderReadyPromise;

    // Session S (a separate PGTestStorage instance/connection): the real
    // production code path, racing language 2 toward the same brand-new
    // name. Its own duplicate-name SELECT ... FOR UPDATE sees zero matching
    // rows (R's rename is uncommitted and thus invisible), takes no lock,
    // and passes -- exactly the gap fm4a.9's app-level check cannot close on
    // its own. Its subsequent UPDATE is what we expect to block on R's
    // uncommitted unique-index entry.
    const [{ pg_backend_pid: storagePid }] = await storage.sql`SELECT pg_backend_pid()`;
    const updatePromise = storage.updateLanguageChecked(2, { name: RACE_NAME });

    // Confirm session S is actually blocked waiting on a lock before we let
    // R commit -- otherwise a lucky ordering (R committing first) would make
    // S's own duplicate-name SELECT see the conflict directly, silently
    // degrading this into the same scenario the existing controller test
    // already covers, and this test would keep "passing" even with the
    // unique index dropped.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let observedBlocked = false;
    while (Date.now() < deadline) {
      const [row] = await monitor`
        SELECT wait_event_type FROM pg_stat_activity WHERE pid = ${storagePid}
      `;
      if (row?.wait_event_type === "Lock") {
        observedBlocked = true;
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    expect(observedBlocked).toBe(true);

    // Release R: it commits its rename of language 3 to the race name. S's
    // blocked UPDATE now resolves -- as a unique violation, since R got
    // there first.
    releaseHolder();
    await held;

    await expect(updatePromise).rejects.toMatchObject({ status: 409 });

    // R's rename committed successfully; confirm the database agrees.
    const [lang3] = await raw`SELECT name FROM languages WHERE languageid = 3`;
    expect(lang3.name).toBe(RACE_NAME);

    // S's rename lost the race and must not have applied.
    const [lang2] = await raw`SELECT name FROM languages WHERE languageid = 2`;
    expect(lang2.name).toBe(originalName2);
  }, 15000);
});
