import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import {
  sofficeAssemble,
  SofficeAssembleAbortedError,
  SofficeAssembleTimeoutError,
} from "./sofficeAssemble";

/**
 * Integration coverage for `sofficeAssemble`'s process-group kill against REAL
 * processes.
 *
 * `sofficeAssemble.test.ts` mocks `child_process.spawn` and spies on
 * `process.kill`, so it proves only that a kill was *requested*. It cannot
 * prove the thing the design actually rests on: that spawning `detached: true`
 * and killing `-pid` reaps the whole tree, including a grandchild the launcher
 * forked. `soffice` does exactly that (`soffice` -> `oosplash` ->
 * `soffice.bin`), and a lone-PID kill would orphan the real worker.
 *
 * This test uses the existing `sofficeBin` seam to substitute a tiny shell
 * script that reproduces the shape without the cost or flakiness of a
 * deliberately-hung LibreOffice: it forks a `sleep`, records both pids, and
 * never exits. The headline assertion is that the GRANDCHILD dies — it is not
 * our child, so no SIGCHLD bookkeeping of Node's can be mistaken for the group
 * kill working.
 *
 * POSIX-gated rather than Linux-gated: `detached` + `kill(-pid)` are POSIX
 * process-group semantics and are worth exercising on a macOS dev box too.
 * (The `/proc`-based reaper's coverage is Linux-only — see
 * `reapOrphanedSoffice.integration.test.ts`.)
 *
 * Scope limit, stated honestly: this proves the group kill's process
 * semantics. It does NOT prove that a real `soffice` mid-merge is killable,
 * nor that the killed group is *gone* before the registry promotes a
 * successor — `sofficeAssemble` releases its concurrency-1 slot on
 * kill-*issued*, not kill-*confirmed*.
 */

jest.setTimeout(60_000);

const describePosix = process.platform === "win32" ? describe.skip : describe;

/**
 * The fake `soffice`. POSIX `/bin/sh` (dash on Debian), and deliberately
 * SILENT: `sofficeAssemble` spawns with default stdio (pipes) and never drains
 * them, so a chatty script could block on a full pipe buffer and turn every
 * case into a spurious timeout.
 *
 * NEVER add `set -m`. Job control would place the background `sleep` in its
 * OWN process group, where it would survive the group kill — i.e. it would
 * fake a pass of the exact property this test exists to prove.
 */
function scriptSource(fixture: FixturePaths): string {
  return [
    "#!/bin/sh",
    "# Warm invocation: sofficeAssemble step 1 passes --convert-to. Exit clean so",
    "# the flow proceeds to inject + run.",
    'for a in "$@"; do case "$a" in --convert-to) exit 0 ;; esac; done',
    "# Run invocation (macro:///...): behave like a hung soffice that has forked a",
    "# child, then never exit.",
    `echo $$ > ${shQuote(fixture.launcherPidFile)}`,
    `${shQuote(fixture.childScriptPath)} &`,
    `echo $! > ${shQuote(fixture.childPidFile)}`,
    "wait",
    "",
  ].join("\n");
}

/**
 * The forked grandchild, as its OWN uniquely-named script rather than a bare
 * `sleep 600 &`.
 *
 * Living under the fixture's `mkdtemp` dir is what makes the grandchild
 * identifiable to {@link fixtureProcesses}. A bare `sleep 600 &` would show up
 * in `ps` as that wholly generic command, leaving failure-path cleanup no way
 * to tell our grandchild from any other process — and in particular no way to
 * find it at all once the launcher has died. Identifying it by parent pid
 * instead would fail in exactly that case: an orphan's ppid is init's, not
 * ours.
 *
 * NOT `exec sleep 600`: exec would replace this shell and the process would
 * lose the identifying command line. The trailing `exit 0` keeps `sh` from
 * applying its last-command exec optimization for the same reason.
 */
const CHILD_SCRIPT_SOURCE = ["#!/bin/sh", "sleep 600", "exit 0", ""].join("\n");

/**
 * Single-quote a path for `/bin/sh`. The redirection targets are interpolated
 * into script text, so an unquoted `$TMPDIR` containing whitespace would split
 * into two words and the redirect would fail.
 */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The paths `scriptSource` bakes into the generated script text. */
interface FixturePaths {
  launcherPidFile: string;
  childPidFile: string;
  childScriptPath: string;
}

interface Fixture extends FixturePaths {
  dir: string;
  scriptPath: string;
  workRoot: string;
  jobId: string;
  outputPath: string;
}

/**
 * A fresh dir, script, and pid-file pair PER CASE.
 *
 * Sharing pid files across cases would make the timeout case vacuous: the
 * abort case's files would already exist and already hold dead pids, so
 * "the files exist" and "the pids are dead" would both be trivially true
 * without this case's script ever having run.
 */
function makeFixture(): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soffice-groupkill-"));
  const paths: FixturePaths = {
    launcherPidFile: path.join(dir, "launcher.pid"),
    childPidFile: path.join(dir, "child.pid"),
    childScriptPath: path.join(dir, "fake-soffice-child.sh"),
  };
  const scriptPath = path.join(dir, "fake-soffice.sh");
  fs.writeFileSync(scriptPath, scriptSource(paths), { mode: 0o755 });
  fs.writeFileSync(paths.childScriptPath, CHILD_SCRIPT_SOURCE, { mode: 0o755 });
  const workRoot = path.join(dir, "assembly-work");
  fs.mkdirSync(workRoot, { recursive: true });
  return {
    ...paths,
    dir,
    scriptPath,
    workRoot,
    jobId: crypto.randomUUID(),
    outputPath: path.join(dir, "out.odt"),
  };
}

/**
 * Zombie-aware liveness. `process.kill(pid, 0)` alone is NOT enough: a killed
 * but unreaped process still answers it, and the `sleep` grandchild reparents
 * to a PID 1 that, in a GitHub Actions `container:` job, does not reap. So the
 * zombie answers `kill(pid, 0)` forever and a naive check never sees it die.
 *
 * `ps -o state= -p <pid>` behaves identically on Debian procps ("Z") and macOS
 * BSD ps ("Z+"), and exits non-zero once the pid is gone.
 */
function isLive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false; // ESRCH — gone
  }
  let state: string;
  try {
    state = execFileSync("ps", ["-o", "state=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (err) {
    // Discriminate the two very different ways execFileSync throws. Collapsing
    // both to `false` would make a missing `ps` present as "the process never
    // came alive", sending a reader to debug the fake script instead of the
    // container image.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        "`ps` is required by this test but is not on PATH (Debian: `apt-get install -y procps`)",
        { cause: err }
      );
    }
    return false; // ps exits non-zero when the pid is gone
  }
  return !state.startsWith("Z");
}

/** This process's own process-group id, so cleanup can never signal jest itself. */
function ownProcessGroupId(): number {
  const pgid = Number(
    execFileSync("ps", ["-o", "pgid=", "-p", String(process.pid)], { encoding: "utf8" }).trim()
  );
  if (!Number.isInteger(pgid) || pgid <= 0) {
    throw new Error("could not read own pgid from ps");
  }
  return pgid;
}

/**
 * Every live process whose command line names this fixture's `mkdtemp` dir,
 * with the process group `ps` reports for it.
 *
 * A full `ps` sweep rather than a read of the pid files, because cleanup has
 * to work when the fake script FAILED — the pid files are written by the very
 * script whose misbehaviour is the thing being cleaned up after, so a case
 * that never got as far as writing them would otherwise leak silently. (This
 * is not hypothetical: it is exactly how an earlier revision leaked a real
 * `sleep` when a deliberately-broken script could not write its pid files.)
 *
 * The fixture dir is a fresh `mkdtemp` path, so matching on it is an identity
 * check, not a heuristic — no reused pid can be running a program out of a
 * directory created moments ago for this one test.
 */
function fixtureProcesses(fixture: Fixture): { pid: number; pgid: number }[] {
  let out: string;
  try {
    out = execFileSync("ps", ["-eo", "pid=,pgid=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [];
  }
  const found: { pid: number; pgid: number }[] = [];
  for (const line of out.split("\n")) {
    if (!line.includes(fixture.dir)) continue;
    const match = /^\s*(\d+)\s+(\d+)\s/.exec(line);
    if (match === null) continue;
    found.push({ pid: Number(match[1]), pgid: Number(match[2]) });
  }
  return found;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A pid from one of the fixture's pid files, or `undefined` if the file is
 * absent, half-written, or nonsense.
 *
 * The pid FILES — not a variable captured in the test body — are the record of
 * what this case started, because cleanup must work even when the test failed
 * before it ever read them.
 */
function readPidFile(file: string): number | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8").trim();
  } catch {
    return undefined;
  }
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 1 ? pid : undefined;
}

/** Poll until both pid files exist AND parse, so a half-written file is never read. */
async function waitForPids(fixture: Fixture, deadlineMs: number): Promise<[number, number]> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const pids = [fixture.launcherPidFile, fixture.childPidFile].map(readPidFile);
    if (pids[0] !== undefined && pids[1] !== undefined) {
      return [pids[0], pids[1]];
    }
    if (Date.now() >= until) {
      throw new Error(
        `timed out waiting for the fake soffice to write its pid files ` +
          `(launcher=${JSON.stringify(pids[0])}, child=${JSON.stringify(pids[1])}); ` +
          `dir contents: ${JSON.stringify(fs.readdirSync(fixture.dir))}`
      );
    }
    await sleep(50);
  }
}

async function waitForLiveness(pids: number[], want: boolean, deadlineMs: number): Promise<void> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const states = pids.map((pid) => isLive(pid));
    if (states.every((live) => live === want)) return;
    if (Date.now() >= until) {
      throw new Error(
        `timed out waiting for pids ${JSON.stringify(pids)} to all be ` +
          `${want ? "live" : "dead"}; observed live=${JSON.stringify(states)}`
      );
    }
    await sleep(50);
  }
}

describePosix("sofficeAssemble process-group kill (real detached processes)", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = makeFixture();
    // A `noexec` $TMPDIR otherwise surfaces as a baffling EACCES from deep
    // inside sofficeAssemble's spawn.
    try {
      fs.accessSync(fixture.scriptPath, fs.constants.X_OK);
    } catch (err) {
      throw new Error(
        `the fake soffice script at ${fixture.scriptPath} is not executable — is ` +
          `$TMPDIR mounted noexec?`,
        { cause: err }
      );
    }
  });

  /**
   * Cleanup reads the pid files rather than a variable the test body filled
   * in: a case that failed before `waitForPids` returned would otherwise know
   * no pids at all and leak the fake soffice.
   *
   * Every signal is gated on IDENTITY, not merely on liveness: a pid that has
   * already exited may have been reused, and `kill(-pid)` on a reused pid
   * would signal an unrelated process group. {@link fixtureProcesses} only
   * yields processes `ps` reports as still running out of THIS fixture's
   * `mkdtemp` dir, and only their observed pgid is ever signalled.
   */
  afterEach(async () => {
    const ownPgid = ownProcessGroupId();
    const until = Date.now() + 10_000;
    let consecutiveClearScans = 0;
    while (consecutiveClearScans < 3 && Date.now() < until) {
      const survivors = fixtureProcesses(fixture);
      if (survivors.length === 0) {
        consecutiveClearScans += 1;
      } else {
        consecutiveClearScans = 0;
        // Group kill, not a per-pid kill: the grandchild forks a `sleep` whose
        // own command line does NOT name the fixture dir, so only signalling
        // the group reaches it. Both shells sit in the group led by the
        // launcher, so any confirmed survivor's pgid identifies that group.
        for (const { pgid } of survivors) {
          if (pgid <= 1 || pgid === ownPgid) continue;
          try {
            process.kill(-pgid, "SIGKILL");
          } catch {
            /* already gone */
          }
        }
      }
      await sleep(100);
    }
    fs.rmSync(fixture.dir, { recursive: true, force: true });
  });

  test("aborting the caller's signal kills the launcher AND the grandchild it forked", async () => {
    const controller = new AbortController();
    // Generous timeout so the internal hard timer cannot interfere: this case
    // is about the abort path, and the test controls the exact kill moment.
    //
    // The promise is attached BEFORE the liveness poll on purpose. If an
    // assertion below threw while the promise was still pending, a later
    // rejection with no handler would surface as an unhandled rejection.
    const settled = sofficeAssemble({
      jobId: fixture.jobId,
      files: [],
      outputPath: fixture.outputPath,
      workRoot: fixture.workRoot,
      sofficeBin: fixture.scriptPath,
      timeoutMs: 60_000,
      signal: controller.signal,
    }).then(
      () => {
        throw new Error("expected sofficeAssemble to reject, but it resolved");
      },
      (err: unknown) => err
    );

    const [launcherPid, sleepPid] = await waitForPids(fixture, 20_000);
    await waitForLiveness([launcherPid, sleepPid], true, 10_000);

    controller.abort();

    expect(await settled).toBeInstanceOf(SofficeAssembleAbortedError);

    // The headline assertion. `sleepPid` is a GRANDCHILD — Node never spawned
    // it and has no handle on it — so its death can only come from the
    // negative-pid group kill.
    await waitForLiveness([launcherPid, sleepPid], false, 10_000);
  });

  test("the hard timeout kills the launcher AND the grandchild it forked", async () => {
    const settled = sofficeAssemble({
      jobId: fixture.jobId,
      files: [],
      outputPath: fixture.outputPath,
      workRoot: fixture.workRoot,
      sofficeBin: fixture.scriptPath,
      timeoutMs: 3_000,
    }).then(
      () => {
        throw new Error("expected sofficeAssemble to reject, but it resolved");
      },
      (err: unknown) => err
    );

    expect(await settled).toBeInstanceOf(SofficeAssembleTimeoutError);

    // Deliberately NOT polling for liveness while the timer runs — that would
    // race the 3s timer. Instead: the pid files prove the run step really ran
    // and really forked, and this fixture's files are fresh (see makeFixture),
    // so neither can be inherited from the abort case above.
    const [launcherPid, sleepPid] = await waitForPids(fixture, 20_000);

    // Non-vacuous: the abort case above proved this script stays alive
    // indefinitely when nobody kills it.
    await waitForLiveness([launcherPid, sleepPid], false, 10_000);
  });
});
