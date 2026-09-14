import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { execFileSync, spawn } from "child_process";
import {
  matchesAssemblyJob,
  parseProcessGroupId,
  reapOrphanedSoffice,
} from "./reapOrphanedSoffice";
import { sweepAssemblyWork } from "./sweepAssemblyWork";

/**
 * Integration coverage for `reapOrphanedSoffice` against a REAL LibreOffice on
 * a REAL `/proc`.
 *
 * `reapOrphanedSoffice.test.ts` unit-tests `matchesAssemblyJob` and
 * `parseProcessGroupId` against hand-written fixtures that are *guesses* about
 * LibreOffice's Linux argv, plus two negative cases that pass on macOS (no
 * `/proc`) and on Linux (nothing matches) alike — so they cannot distinguish
 * "correctly inert" from "broken". A regression making `matchesAssemblyJob`
 * always return `false` would still leave that suite green.
 *
 * This test closes that gap by proving the four real-world assumptions the
 * reaper rests on, end to end:
 *
 * 1. LibreOffice's actual Linux argv retains `-env:UserInstallation=`.
 * 2. `matchesAssemblyJob` finds it in a real `/proc/<pid>/cmdline`.
 * 3. `parseProcessGroupId` reads the right pgrp from a real
 *    kernel-generated `/proc/<pid>/stat`.
 * 4. The negative-pgrp SIGKILL actually reaps the `oosplash` ->
 *    `soffice.bin` tree, not just the pid we spawned.
 *
 * Scope limit, stated honestly: this proves argv retention, the process-tree
 * shape, the pgrp read, and the group kill for an `--accept`-invoked
 * `soffice`. It does NOT prove that a `soffice` sitting mid-merge is
 * killable. That is the honest claim — and it is still the claim the reaper
 * needs, because the reaper's job is identifying and killing a stranded
 * process, not interrupting a particular workload.
 *
 * Linux-only because it is IMPOSSIBLE elsewhere, not merely unprovisioned:
 * `/proc` cannot exist on Darwin and the reaper is documented inert without
 * it, so there is nothing a macOS dev could install to change that. Hence
 * `describe.skip` here, where the repo's convention elsewhere (see
 * `assembleQuarter.integration.test.ts`) is to THROW naming the missing
 * command. The `soffice` preflight below keeps that convention for the part
 * that really is merely unprovisioned.
 */

jest.setTimeout(120_000);

const describeLinux = process.platform === "linux" ? describe : describe.skip;

const PROC_ROOT = "/proc";

interface ProcMatch {
  pid: number;
  pgrp: number;
  argv: string[];
}

/** A member of the real LibreOffice process tree, as seen by the independent oracle. */
interface TreeProc {
  pid: number;
  ppid: number;
  pgrp: number;
  argv: string[];
}

/**
 * Jest's own process-group id, read from an oracle OUTSIDE the code under
 * test.
 *
 * NOTE: `process.getpgrp()` does NOT exist in Node (it is `undefined` in Node
 * 24) — do not reach for it. `ps -o pgid=` behaves identically on Debian
 * procps and macOS BSD ps.
 */
function ownProcessGroupId(): number {
  const out = execFileSync("ps", ["-o", "pgid=", "-p", String(process.pid)], {
    encoding: "utf8",
  }).trim();
  const pgid = Number(out);
  if (!Number.isInteger(pgid) || pgid <= 0) {
    throw new Error(`could not read own pgid from ps (got ${JSON.stringify(out)})`);
  }
  return pgid;
}

/**
 * The reaper's `/proc` SCAN, duplicated here on purpose.
 *
 * The loop is duplicated so the safety interlock below does not depend on the
 * production function's control flow. The two exported helpers
 * (`matchesAssemblyJob` / `parseProcessGroupId`) are NOT duplicated — calling
 * the real ones is the entire point: that is what turns this into the first
 * positive test of either, and it means the interlock inspects the exact pgrp
 * values `reapOrphanedSoffice` will hand to `process.kill`.
 */
function scanMatches(jobId: string): ProcMatch[] {
  const found: ProcMatch[] = [];
  for (const name of fs.readdirSync(PROC_ROOT)) {
    if (!/^\d+$/.test(name)) continue;
    let cmdline: string;
    try {
      cmdline = fs.readFileSync(path.join(PROC_ROOT, name, "cmdline"), "utf8");
    } catch {
      continue; // exited mid-scan, or not ours to read
    }
    if (!matchesAssemblyJob(cmdline, jobId)) continue;
    let pgrp: number | undefined;
    try {
      pgrp = parseProcessGroupId(fs.readFileSync(path.join(PROC_ROOT, name, "stat"), "utf8"));
    } catch {
      continue;
    }
    if (pgrp === undefined) continue;
    found.push({ pid: Number(name), pgrp, argv: cmdline.split("\0").filter((a) => a !== "") });
  }
  return found;
}

/**
 * `pid -> {ppid, pgid}` for every live process, from `ps`.
 *
 * `ps` rather than a parse of `/proc/<pid>/stat`, so the process-tree oracle
 * below shares no code — and no failure mode — with `parseProcessGroupId`.
 */
function psTable(): Map<number, { ppid: number; pgid: number }> {
  const table = new Map<number, { ppid: number; pgid: number }>();
  let out: string;
  try {
    out = execFileSync("ps", ["-eo", "pid=,ppid=,pgid="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return table;
  }
  for (const line of out.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (match === null) continue;
    table.set(Number(match[1]), { ppid: Number(match[2]), pgid: Number(match[3]) });
  }
  return table;
}

/** Live pids whose `/proc` cmdline names a LibreOffice binary. Empty cmdline (a zombie) never matches. */
function sofficeIshPids(): Set<number> {
  const pids = new Set<number>();
  let names: string[];
  try {
    names = fs.readdirSync(PROC_ROOT);
  } catch {
    return pids;
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    let cmdline: string;
    try {
      cmdline = fs.readFileSync(path.join(PROC_ROOT, name, "cmdline"), "utf8");
    } catch {
      continue;
    }
    if (cmdline.includes("soffice") || cmdline.includes("oosplash")) pids.add(Number(name));
  }
  return pids;
}

/** Every transitive child of `root`, per the `ps` parent table. */
function descendantsOf(
  root: number,
  table: Map<number, { ppid: number; pgid: number }>
): Set<number> {
  const childrenOf = new Map<number, number[]>();
  for (const [pid, row] of table) {
    const siblings = childrenOf.get(row.ppid);
    if (siblings === undefined) childrenOf.set(row.ppid, [pid]);
    else siblings.push(pid);
  }
  const found = new Set<number>();
  const stack = [root];
  while (stack.length > 0) {
    for (const child of childrenOf.get(stack.pop() as number) ?? []) {
      if (found.has(child)) continue;
      found.add(child);
      stack.push(child);
    }
  }
  return found;
}

/**
 * The REAL LibreOffice process tree this test started, identified WITHOUT
 * reference to the per-job profile argument.
 *
 * This is the oracle that closes the gap `scanMatches` structurally cannot:
 * `scanMatches` only sees processes that still carry
 * `-env:UserInstallation=…/<jobId>/`, so if `oosplash` kept that argument and
 * stayed in the group while `soffice.bin` DROPPED it (or called `setsid`),
 * every job-scoped check would go green while a detached `soffice.bin` lived
 * on. That is precisely the real-LibreOffice failure mode this suite exists to
 * rule out, so the tree must be identified independently.
 *
 * Membership is the UNION of two signals, because each covers the other's
 * blind spot:
 *  - a soffice-named process that did not exist before the spawn — survives a
 *    double-fork that reparents the process away from us;
 *  - a transitive child of the pid we spawned — survives LibreOffice renaming
 *    its binaries.
 *
 * `--runInBand` (package.json) serialises the suite, so "new since the
 * snapshot" cannot pick up a concurrent test's LibreOffice.
 */
function scanProcessTree(spawnedPid: number, preexisting: ReadonlySet<number>): TreeProc[] {
  const table = psTable();
  const descendants = descendantsOf(spawnedPid, table);
  const members: TreeProc[] = [];
  for (const pid of sofficeIshPids()) {
    if (!preexisting.has(pid)) descendants.add(pid);
  }
  descendants.add(spawnedPid);
  for (const pid of descendants) {
    const row = table.get(pid);
    if (row === undefined) continue; // exited between the two reads
    let argv: string[] = [];
    try {
      argv = fs
        .readFileSync(path.join(PROC_ROOT, String(pid), "cmdline"), "utf8")
        .split("\0")
        .filter((a) => a !== "");
    } catch {
      /* exited, or a zombie: an empty argv is the honest answer */
    }
    members.push({ pid, ppid: row.ppid, pgrp: row.pgid, argv });
  }
  return members;
}

/**
 * A CLEANUP-ONLY scanner that shares NO code with the module under test.
 *
 * `scanMatches` above deliberately calls the real `matchesAssemblyJob` /
 * `parseProcessGroupId` — that is what makes it a positive test of them. But
 * that makes it the wrong tool for failure-path cleanup: if
 * `matchesAssemblyJob` regressed to always return `false`, the tests would
 * correctly fail AND cleanup would see nothing to kill, delete the profile
 * tree, and leak a real LibreOffice. Cleanup must stay correct precisely when
 * the code under test is broken, so it identifies the process itself (the
 * explicit `-env:UserInstallation=` argument carrying this test's UUID) and
 * reads the pgrp from `ps`, the same independent oracle
 * {@link ownProcessGroupId} uses.
 */
function cleanupScan(jobId: string): { pid: number; pgrp: number }[] {
  const found: { pid: number; pgrp: number }[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(PROC_ROOT);
  } catch {
    return found;
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    let args: string[];
    try {
      args = fs
        .readFileSync(path.join(PROC_ROOT, name, "cmdline"), "utf8")
        .split("\0")
        .filter((a) => a !== "");
    } catch {
      continue;
    }
    // The UUID-bearing profile argument alone. No `soffice`/`oosplash` gate:
    // this is cleanup, and a v4 UUID generated by this test moments ago is
    // already false-positive-proof.
    if (!args.some((a) => a.startsWith("-env:UserInstallation=") && a.includes(`/${jobId}/`))) {
      continue;
    }
    const pid = Number(name);
    let pgrp: number;
    try {
      pgrp = Number(
        execFileSync("ps", ["-o", "pgid=", "-p", name], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim()
      );
    } catch {
      continue; // exited between the scan and the ps
    }
    if (!Number.isInteger(pgrp) || pgrp <= 0) continue;
    found.push({ pid, pgrp });
  }
  return found;
}

/**
 * Every `/proc` entry whose cmdline mentions soffice, as pid/ppid/pgrp/comm/argv.
 *
 * This rides inside thrown errors rather than being logged, because
 * `jestSetupAfterEnv.ts` imports `jestSilenceConsole.ts`, which no-ops
 * `console.*` unless `VERBOSE=1`. A helper that logged on failure would yield
 * a bare "timed out" with nothing to debug — and this dump is precisely what
 * distinguishes "`soffice.bin` survived in a different pgrp, so the reaper's
 * premise is wrong" from "flake".
 */
function sofficeProcDump(): string {
  const lines: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(PROC_ROOT);
  } catch {
    return "<unreadable /proc>";
  }
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue;
    let cmdline: string;
    let stat: string;
    try {
      cmdline = fs.readFileSync(path.join(PROC_ROOT, name, "cmdline"), "utf8");
      stat = fs.readFileSync(path.join(PROC_ROOT, name, "stat"), "utf8");
    } catch {
      continue;
    }
    if (!cmdline.includes("soffice") && !cmdline.includes("oosplash")) continue;
    const commEnd = stat.lastIndexOf(")");
    const comm = commEnd === -1 ? "?" : stat.slice(stat.indexOf("(") + 1, commEnd);
    const fields = stat
      .slice(commEnd + 1)
      .trim()
      .split(/\s+/);
    const argv = cmdline.split("\0").filter((a) => a !== "");
    lines.push(
      `  pid=${name} ppid=${fields[1]} pgrp=${fields[2]} comm=${comm} argv=${JSON.stringify(argv)}`
    );
  }
  return lines.length > 0 ? lines.join("\n") : "  <no soffice-ish process in /proc>";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll-with-deadline, never a fixed sleep: `soffice` execs `oosplash`, which
 * forks `soffice.bin`, and a cold start on a fresh profile in a throttled
 * container is 1-5s and sometimes worse.
 */
async function waitForMatch(
  jobId: string,
  deadlineMs: number,
  context: () => string
): Promise<ProcMatch[]> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const found = scanMatches(jobId);
    if (found.length > 0) return found;
    if (Date.now() >= until) {
      throw new Error(
        `no /proc entry matched assembly job ${jobId} within ${deadlineMs}ms.\n` +
          `${context()}\n` +
          `soffice-ish processes in /proc:\n${sofficeProcDump()}`
      );
    }
    await sleep(100);
  }
}

/**
 * Wait until the LibreOffice tree stops growing, then return it.
 *
 * `soffice` execs `oosplash`, which forks `soffice.bin`, so a snapshot taken
 * the instant the first process matches would miss the very member most likely
 * to have escaped the group. Requires the membership to hold steady across
 * three consecutive scans before trusting it.
 *
 * Deliberately does NOT require more than one member to call the tree stable.
 * Requiring that would turn "LibreOffice collapsed to a single process" — a
 * real, readable finding about the launcher chain — into an opaque 30s
 * timeout. Membership size is asserted by the caller instead. The
 * {@link MIN_SETTLE_MS} floor is what prevents snapshotting during the early
 * window where only the launcher exists.
 */
const MIN_SETTLE_MS = 3_000;

async function waitForStableTree(
  spawnedPid: number,
  preexisting: ReadonlySet<number>,
  deadlineMs: number,
  context: () => string
): Promise<TreeProc[]> {
  const started = Date.now();
  const until = started + deadlineMs;
  let previous = "";
  let stableScans = 0;
  let tree: TreeProc[] = [];
  while (Date.now() < until) {
    tree = scanProcessTree(spawnedPid, preexisting);
    const signature = tree
      .map((p) => p.pid)
      .sort((a, b) => a - b)
      .join(",");
    stableScans = signature === previous ? stableScans + 1 : 0;
    previous = signature;
    if (stableScans >= 3 && tree.length > 0 && Date.now() - started >= MIN_SETTLE_MS) {
      return tree;
    }
    await sleep(150);
  }
  throw new Error(
    `the LibreOffice process tree never stabilised within ${deadlineMs}ms ` +
      `(last seen: ${JSON.stringify(tree)}).\n${context()}\n` +
      `soffice-ish processes in /proc:\n${sofficeProcDump()}`
  );
}

/**
 * Assert every member of the pre-kill tree snapshot is gone, using the
 * INDEPENDENT oracle rather than the job-scoped one.
 *
 * A member counts as gone when it has left the process table, or is a zombie
 * (empty argv), or its pid has been reused by something that is plainly not
 * ours. Anything else is a survivor — including, crucially, a `soffice.bin`
 * that dropped the profile argument and would therefore look "gone" to
 * `waitForGone`.
 */
async function waitForTreeGone(
  tree: readonly TreeProc[],
  deadlineMs: number,
  context: () => string
): Promise<void> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const table = psTable();
    const survivors = tree.filter((member) => {
      if (!table.has(member.pid)) return false;
      let argv: string[];
      try {
        argv = fs
          .readFileSync(path.join(PROC_ROOT, String(member.pid), "cmdline"), "utf8")
          .split("\0")
          .filter((a) => a !== "");
      } catch {
        return false;
      }
      if (argv.length === 0) return false; // zombie
      // Guard against pid reuse: only still-LibreOffice-looking processes count.
      return argv.some((a) => a.includes("soffice") || a.includes("oosplash"));
    });
    if (survivors.length === 0) return;
    if (Date.now() >= until) {
      throw new Error(
        `${survivors.length} member(s) of the spawned LibreOffice tree survived the reap ` +
          `after ${deadlineMs}ms: ${JSON.stringify(survivors)}\n` +
          `This is the failure the job-scoped check cannot see — a surviving process that ` +
          `no longer carries the per-job profile argument, or that left the process group.\n` +
          `${context()}\nsoffice-ish processes in /proc:\n${sofficeProcDump()}`
      );
    }
    await sleep(100);
  }
}

/**
 * Assert the job's processes are gone via `scanMatches`, NEVER via
 * `process.kill(pid, 0)`.
 *
 * After a group SIGKILL the launcher can sit as a zombie, and in a GitHub
 * Actions `container:` job an orphaned grandchild's zombie reparents to a PID
 * 1 that does not reap it — so `kill(pid, 0)` would succeed forever. A
 * zombie's `/proc/<pid>/cmdline` reads EMPTY, so `matchesAssemblyJob` returns
 * false for it. Do not "simplify" this to a liveness probe.
 */
async function waitForGone(
  jobId: string,
  deadlineMs: number,
  context: () => string
): Promise<void> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const survivors = scanMatches(jobId);
    if (survivors.length === 0) return;
    if (Date.now() >= until) {
      throw new Error(
        `assembly job ${jobId} still has live matching processes ${deadlineMs}ms after the reap: ` +
          `${JSON.stringify(survivors)}\n` +
          `${context()}\n` +
          `soffice-ish processes in /proc:\n${sofficeProcDump()}`
      );
    }
    await sleep(100);
  }
}

describeLinux("reapOrphanedSoffice (real LibreOffice, real /proc, real group kill)", () => {
  /**
   * NOT `soffice`- or `oosplash`-containing, deliberately.
   *
   * `matchesAssemblyJob`'s first gate is
   * `args.some(a => a.includes("soffice") || a.includes("oosplash"))`, and the
   * `-env:UserInstallation=file://<tmpRoot>/...` argument IS one of those args.
   * A prefix like `reapOrphanedSoffice-test-` would satisfy that gate through
   * the profile path alone, so this test would pass even if real LibreOffice
   * argv contained neither string — silently defeating its entire point.
   */
  const TMP_PREFIX = "reap-orphan-integration-";

  let tmpRoot: string;
  let jobId: string;
  let ownPgrp: number;
  /** Recorded exits, so a "never appeared" failure can say the launcher died early. */
  let exits: string[];
  /** LibreOffice pids alive BEFORE this test spawned anything — the baseline `scanProcessTree` diffs against. */
  let preexistingSoffice: Set<number>;
  /**
   * The pre-kill tree snapshot, shared with cleanup.
   *
   * Cleanup needs it because a member that dropped the profile argument — the
   * exact escape this snapshot exists to catch — is invisible to
   * {@link cleanupScan}. Without this, the assertion that catches the leak
   * would also be the assertion that causes it.
   */
  let treeSnapshot: TreeProc[];

  beforeAll(() => {
    // Matches assembleQuarter.integration.test.ts's preflight: a MISSING
    // toolchain is unprovisioned (throw, naming the fix), unlike a missing
    // /proc, which is impossible (skip, above).
    try {
      execFileSync("soffice", ["--version"], { stdio: "ignore" });
    } catch (err) {
      throw new Error(
        `\`soffice\` is required by this test but is not on PATH. ` +
          `CI: \`apt-get install -y libreoffice\`; local: ` +
          `\`brew install --cask libreoffice\`.`,
        { cause: err }
      );
    }
  });

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
    jobId = crypto.randomUUID();
    fs.mkdirSync(path.join(tmpRoot, jobId, "profile"), { recursive: true });
    ownPgrp = ownProcessGroupId();
    exits = [];
    preexistingSoffice = sofficeIshPids();
    treeSnapshot = [];
  });

  /**
   * Cleanup runs on the FAILURE path too (after a failed assertion, and after
   * a jest timeout), which is why the `pgrp > 1` / `!== ownPgrp` guards are
   * repeated here rather than assumed from the test body.
   *
   * IDENTITY, NEVER A REMEMBERED PID. It is tempting to kill `-<the pid we
   * spawned>` directly, but a pid we spawned may have already exited and been
   * REUSED, and `kill(-<reused pid>)` would then signal an unrelated process
   * group — the precise hazard `reapOrphanedSoffice`'s own doc comment cites
   * as the reason it scans rather than recording pids. So a scan is the sole
   * cleanup authority here: it yields only processes whose cmdline STILL
   * carries this test's UUID job id, and kills the pgrp observed on that live
   * process.
   *
   * That scan is {@link cleanupScan}, NOT `scanMatches` — cleanup must not
   * route through the code under test, or a regression in
   * `matchesAssemblyJob` would fail the assertions and silently leak a real
   * LibreOffice at the same time.
   *
   * Loops until three consecutive clear scans rather than one, so a soffice
   * that was spawned but had not yet populated its `/proc` cmdline when
   * cleanup started is still caught (~300ms in the common already-clean case).
   *
   * `jest.integration.config.js` sets `forceExit: true`, so a leaked real
   * LibreOffice would not fail the run — it would just linger. The order
   * mirrors the reap-before-delete ordering `sweepAssemblyWork` itself
   * documents: kill, confirm gone, and only THEN `rm -rf` the profile tree.
   */
  afterEach(async () => {
    const killGroup = (pgrp: number): void => {
      if (pgrp <= 1 || pgrp === ownPgrp) return;
      try {
        process.kill(-pgrp, "SIGKILL");
      } catch {
        /* already gone */
      }
    };
    // Also sweep the independent tree snapshot, re-confirming identity: a
    // member that escaped by dropping the profile argument is invisible to
    // cleanupScan, and leaving it running is the very leak the assertions are
    // there to detect.
    const killEscapedTreeMembers = (): void => {
      const table = psTable();
      for (const member of treeSnapshot) {
        const row = table.get(member.pid);
        if (row === undefined) continue;
        let cmdline: string;
        try {
          cmdline = fs.readFileSync(path.join(PROC_ROOT, String(member.pid), "cmdline"), "utf8");
        } catch {
          continue;
        }
        // Still LibreOffice, so not a reused pid. Kill the group it is in NOW,
        // which is not necessarily the one recorded in the snapshot.
        if (!cmdline.includes("soffice") && !cmdline.includes("oosplash")) continue;
        killGroup(row.pgid);
      }
    };

    const until = Date.now() + 10_000;
    let consecutiveClearScans = 0;
    while (consecutiveClearScans < 3 && Date.now() < until) {
      const survivors = cleanupScan(jobId);
      if (survivors.length === 0) {
        consecutiveClearScans += 1;
      } else {
        consecutiveClearScans = 0;
        survivors.forEach((survivor) => killGroup(survivor.pgrp));
      }
      killEscapedTreeMembers();
      await sleep(100);
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  /**
   * Spawn a real headless LibreOffice that STAYS UP, pinned to this job's
   * profile.
   *
   * `--accept=pipe` rather than a TCP port: no port allocation, no
   * bind-failure-then-exit path, no collisions between concurrent runs. The
   * fresh per-job UUID profile is REQUIRED — a bare `soffice --accept=...`
   * that shares a UserInstallation with a running instance hands off to it and
   * exits immediately.
   */
  function spawnOrphan(): number {
    const profileDir = path.join(tmpRoot, jobId, "profile");
    const child = spawn(
      "soffice",
      [
        "--headless",
        "--norestore",
        "--nologo",
        `-env:UserInstallation=file://${profileDir}`,
        `--accept=pipe,name=${jobId};urp;`,
      ],
      { detached: true, stdio: "ignore" }
    );
    const pid = child.pid;
    if (pid === undefined) throw new Error("spawn returned no pid for soffice");
    // Deliberately NOT recorded for cleanup — see afterEach: a remembered pid
    // is not an identity. This pid is used only for the premise assertion and
    // for diagnostics.
    child.on("exit", (code, signal) => {
      exits.push(`launcher pid ${pid} exited code=${String(code)} signal=${String(signal)}`);
    });
    child.unref();
    return pid;
  }

  function context(pid: number): () => string {
    return () =>
      `launcher pid=${pid}; recorded exits: ${exits.length > 0 ? exits.join("; ") : "<none>"}`;
  }

  /**
   * Safety interlock. MANDATORY, and it runs before `reapOrphanedSoffice` is
   * ever called: a naive version of this test destroys CI.
   *
   * `pgrp > 1` is not paranoia — `parseProcessGroupId` accepts any positive
   * integer, the CI container runs as root, and `kill(-1)` as root signals
   * every process except PID 1.
   */
  function assertSafeToReap(groups: ProcMatch[]): void {
    for (const group of groups) {
      expect(group.pgrp).toBeGreaterThan(1);
      expect(group.pgrp).not.toBe(ownPgrp);
    }
  }

  test("kills exactly the spawned soffice's process group, and nothing else", async () => {
    const pid = spawnOrphan();

    // Free bonus: cross-validate parseProcessGroupId against a real
    // kernel-generated stat line, with the independent `ps` oracle supplying
    // the expected answer. Until now it was only ever fed hand-written
    // strings, so this is the first check that it agrees with the kernel.
    expect(parseProcessGroupId(fs.readFileSync("/proc/self/stat", "utf8"))).toBe(ownPgrp);

    const groups = await waitForMatch(jobId, 30_000, context(pid));
    assertSafeToReap(groups);

    // Kept OUT of the interlock above deliberately: these encode a premise,
    // not a safety property, and a failure here should read as a real finding
    // rather than "the safety check broke". The premise is that NOTHING in
    // LibreOffice's launcher chain calls setsid(), so every process it starts
    // stays in the group whose leader is the detached pid we spawned. (That
    // holds under exec and under fork-and-wait alike.) A failure means the
    // launcher chain differs from what the reaper assumes.
    expect(new Set(groups.map((g) => g.pgrp))).toEqual(new Set([pid]));

    // The same premise, checked against the INDEPENDENT tree oracle — and this
    // is the check that actually has teeth. The assertion above can only see
    // processes that still carry the per-job profile argument, so a
    // `soffice.bin` that dropped it (or called setsid) would be absent from
    // `groups` entirely and the assertion would pass vacuously. Asserting over
    // the real tree closes that: EVERY member LibreOffice actually started
    // must sit in the spawned group, or the reaper's single group kill cannot
    // reach it.
    treeSnapshot = await waitForStableTree(pid, preexistingSoffice, 30_000, context(pid));
    // >1 because the launcher is expected to have forked at least one worker
    // (`soffice` -> `oosplash` -> `soffice.bin`; 2 members on macOS, 3 on
    // Linux). A single-member tree would mean the launcher chain is not what
    // the reaper's premise describes — worth failing on, and worth reading as
    // a finding rather than a flake.
    expect(treeSnapshot.length).toBeGreaterThan(1);
    // Asserted as a list of escapees rather than member-by-member, so a failure
    // prints the offending processes' full argv — which is what says WHICH
    // LibreOffice process escaped and how.
    expect(treeSnapshot.filter((member) => member.pgrp !== pid)).toEqual([]);

    // Negative control against a LIVE process — the highest-value assertion
    // here, and free: reaping an unrelated workRoot must leave our soffice
    // alone. This upgrades the claim from "kills things" to "kills exactly the
    // right things", against a real process rather than a fixture.
    const decoyRoot = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
    try {
      fs.mkdirSync(path.join(decoyRoot, crypto.randomUUID()), { recursive: true });
      reapOrphanedSoffice(decoyRoot);
      expect(scanMatches(jobId).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(decoyRoot, { recursive: true, force: true });
    }

    reapOrphanedSoffice(tmpRoot);
    await waitForGone(jobId, 15_000, context(pid));
    // The load-bearing gone-check: `waitForGone` is defined by the predicate
    // under test, so it reports "gone" for any process that stopped matching,
    // whether it died or merely shed the profile argument. This one asks the
    // independent oracle whether the processes are actually dead.
    await waitForTreeGone(treeSnapshot, 15_000, context(pid));
  });

  test("sweepAssemblyWork reaps the live soffice before deleting its profile dir", async () => {
    // The real production entry point (`serverApp.ts` calls this on startup),
    // and its documented hazard — `rm -rf`ing a profile tree out from under a
    // live LibreOffice — is mocked in `sweepAssemblyWork.test.ts` and proven
    // nowhere. The case above calls `reapOrphanedSoffice` directly for a
    // cleaner failure signal; this one covers the composed path.
    const pid = spawnOrphan();
    const groups = await waitForMatch(jobId, 30_000, context(pid));
    assertSafeToReap(groups);
    treeSnapshot = await waitForStableTree(pid, preexistingSoffice, 30_000, context(pid));

    sweepAssemblyWork(tmpRoot);

    await waitForGone(jobId, 15_000, context(pid));
    // As above: the independent oracle is what proves the tree is dead, rather
    // than merely no longer matching. It matters more here — `sweepAssemblyWork`
    // goes on to `rm -rf` the profile dir, and doing that under a surviving
    // LibreOffice is the specific hazard its doc comment warns about.
    await waitForTreeGone(treeSnapshot, 15_000, context(pid));
    expect(fs.existsSync(path.join(tmpRoot, jobId))).toBe(false);
  });
});
