import fs from "fs";
import path from "path";
import process from "process";

/**
 * Test-filesystem isolation.
 *
 * `test/docs/serverDocs` is a **git-tracked** fixture corpus (the pristine
 * English masters). Nothing may ever write into it — uploads from Cypress e2e
 * specs used to overwrite the tracked cover masters, and years of test runs
 * left dozens of untracked stragglers behind.
 *
 * Under NODE_ENV=test, `docStorage.docsDirPath()` therefore points at
 * `test/docs/serverDocs-run` — a disposable, gitignored copy of the corpus that
 * every test run wipes and reseeds. The invariant: no test ever writes into a
 * git-tracked path.
 */

/** The pristine, git-tracked fixture corpus. Read-only at all times. */
export function serverDocsFixtureDir() {
  return path.join(process.cwd(), "test", "docs", "serverDocs");
}

/** The disposable, gitignored per-run copy that tests actually read and write. */
export function serverDocsRunDir() {
  return path.join(process.cwd(), "test", "docs", "serverDocs-run");
}

function copyCorpus(srcDir: string, destDir: string) {
  // Recursive: the tracked corpus is the top-level .odt masters plus the
  // committed `web/` webified-HTML fixtures, both of which tests read.
  // Clone-if-possible (instant on APFS); silently falls back to a real copy.
  fs.cpSync(srcDir, destDir, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
}

/**
 * Wipe `serverDocs-run` and reseed it from the tracked corpus. Destructive —
 * call ONCE per test run, from a jest globalSetup or a server boot, never from
 * per-test-file code (jest workers would race each other).
 */
export function reseedServerDocsRunDir() {
  const runDir = serverDocsRunDir();
  fs.rmSync(runDir, { recursive: true, force: true });
  copyCorpus(serverDocsFixtureDir(), runDir);
  return runDir;
}

/**
 * Non-destructive fallback for entry paths that bypass globalSetup: create and
 * populate `serverDocs-run` only if it does not exist yet. Never wipes, so it
 * is safe to call from parallel workers.
 */
export function ensureServerDocsRunDir() {
  const runDir = serverDocsRunDir();
  if (fs.existsSync(runDir)) return runDir;
  fs.mkdirSync(runDir, { recursive: true });
  copyCorpus(serverDocsFixtureDir(), runDir);
  return runDir;
}
