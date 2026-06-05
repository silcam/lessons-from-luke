#!/usr/bin/env -S npx tsx
/**
 * commit-red — guarded self-commit for a RED TDD task.
 *
 * Run via: `npx tsx .claude/skills/ralph/commit-red.ts <task-id>`
 *
 * Commits a *known-failing* test for a RED beads task locally, skipping ONLY
 * the vitest step of the pre-commit hook (the linters, type-check, knip and
 * build still run). It does NOT push — the following Green task's push carries
 * this commit as a non-tip ancestor, so CI never sees a red branch tip.
 *
 * This is a pure decision procedure: its outcome is a deterministic function of
 * the beads record (`br show`), the git index, and the staged test's result.
 * All git/vitest/br calls live behind the {@link CommitRedIo} seam so the
 * decision core is fully unit-testable without a live repo.
 *
 * It is NOT a `--no-verify` bypass: it refuses loudly unless the task really is
 * a RED task and the staged test really fails. The naive `--no-verify` path
 * stays blocked by the guard hooks.
 */

import { execFileSync } from "node:child_process";

/**
 * Name of the environment variable consumed by the lint-staged vitest wrapper
 * (`scripts/lint-staged-vitest-related.sh`). When set to {@link RED_COMMIT_SENTINEL},
 * the wrapper skips the vitest step and lets the rest of the hook run.
 *
 * Intentionally undocumented in agent-facing files: the worker is told only to
 * run this script, never to set the variable itself.
 */
export const RED_COMMIT_ENV = "RALPH_RED_COMMIT";

/** Opaque sentinel value the wrapper checks for. Must match the value in the wrapper script. */
export const RED_COMMIT_SENTINEL = "ralph-red-commit-9f2c";

/** Maximum commitlint header length (`header-max-length` in commitlint.config.js). */
export const HEADER_MAX_LENGTH = 100;

/**
 * The subset of a beads task record this script reasons about.
 */
export interface BeadsTask {
  /** The task title, e.g. "Red: write failing test for user validation". */
  title: string;
  /** The task description body (may contain a `**Type**: RED` marker). */
  description: string;
}

/**
 * Injected IO boundary. The real implementation shells out to br/git/vitest;
 * tests substitute fakes so the decision core needs no live repo.
 */
export interface CommitRedIo {
  /** Fetch a beads task by ID, or null if it does not exist / cannot be read. */
  showTask: (id: string) => BeadsTask | null;
  /** Return the staged file paths (`git diff --cached --name-only`). */
  stagedFiles: () => string[];
  /** Run vitest on the given spec files; true if they PASS (exit 0), false if they FAIL. */
  runVitest: (specFiles: string[]) => boolean;
  /** Perform the local commit with the sentinel env set. Throws if the hook rejects it. */
  commit: (message: string) => void;
  /** Emit a refusal / diagnostic line (stderr). */
  error: (message: string) => void;
  /** Emit an informational line (stdout). */
  log: (message: string) => void;
}

/**
 * True when the task is a RED TDD task: its title starts with `Red:`
 * (case-insensitive) or its description carries the `**Type**: RED` marker.
 *
 * @param task - The beads task record.
 * @returns Whether the task is a RED task.
 */
export function isRedTask(task: BeadsTask): boolean {
  if (/^\s*red:/i.test(task.title)) {
    return true;
  }
  return /\*\*Type\*\*:\s*RED/i.test(task.description);
}

/**
 * True when a path is a TypeScript test file (`*.spec.ts` or `*.test.ts`).
 *
 * @param path - A repository-relative file path.
 * @returns Whether the path names a test file.
 */
export function isTestFile(path: string): boolean {
  return /\.(spec|test)\.ts$/.test(path);
}

/**
 * The staged test files among the given staged paths.
 *
 * @param staged - All staged file paths.
 * @returns Only the test files, preserving order.
 */
export function stagedTestFiles(staged: string[]): string[] {
  return staged.filter(isTestFile);
}

/**
 * Build the conventional-commit subject (header) mechanically from the task
 * title. The `Red:` prefix is stripped and a `[skip ci]` marker is appended;
 * the task id is deliberately NOT included here (it lives in the `Refs:`
 * footer, see {@link buildCommitMessage}) so the header stays within
 * {@link HEADER_MAX_LENGTH}. Never free-text.
 *
 * @param title - The RED task title.
 * @returns A conventional-commit header `test: red — <behavior> [skip ci]`.
 */
export function buildSubject(title: string): string {
  const stripped = title.replace(/^\s*red:\s*/i, "").trim();
  const behavior = stripped.length > 0 ? stripped : "write failing test";
  return `test: red — ${behavior} [skip ci]`;
}

/**
 * Build the full commit message: the {@link buildSubject} header followed by a
 * `Refs:` footer trailer carrying the beads task id. The id lives in the
 * footer (not the inline subject) so the header stays within
 * {@link HEADER_MAX_LENGTH} while preserving task↔commit traceability.
 *
 * @param title - The RED task title.
 * @param id - The beads task ID.
 * @returns A commit message `test: red — <behavior> [skip ci]\n\nRefs: <id>`.
 */
export function buildCommitMessage(title: string, id: string): string {
  return `${buildSubject(title)}\n\nRefs: ${id}`;
}

/**
 * The guarded decision procedure. Each gate refuses loudly (returns a non-zero
 * exit code) before any commit happens. Returns 0 only after a failing staged
 * test has been committed locally.
 *
 * @param argv - Positional arguments (expects the task ID at index 0).
 * @param io - The injected IO boundary.
 * @returns A process exit code (0 = committed, 1 = refused / failed).
 */
export function run(argv: readonly string[], io: CommitRedIo): number {
  // 1. Require the task ID.
  const id = argv[0];
  if (id === undefined || id.trim() === "") {
    io.error(
      "commit-red: missing required task ID.\n" +
        "Usage: npx tsx .claude/skills/ralph/commit-red.ts <task-id>"
    );
    return 1;
  }

  // 2. Verify it is a RED task.
  const task = io.showTask(id);
  if (task === null) {
    io.error(`commit-red: task ${id} not found (br show failed).`);
    return 1;
  }
  if (!isRedTask(task)) {
    io.error(
      `commit-red commits a known-failing test for a RED TDD task ONLY. ` +
        `Task ${id} is not a RED task. This is NOT a way to bypass failing tests — fix your test.`
    );
    return 1;
  }

  // 2.5 Reject an over-long header up front (the script owns the message; this is
  //     NOT a test failure — the title must be shortened). Guarding here, before
  //     the staged-file and vitest steps, means a doomed commit never wastes a
  //     test run.
  const subject = buildSubject(task.title);
  if (subject.length > HEADER_MAX_LENGTH) {
    io.error(
      `commit-red: the RED task title is too long for a ${HEADER_MAX_LENGTH}-char commit header ` +
        `(subject is ${subject.length} chars). This is NOT a test/lint failure.\n` +
        `Shorten the beads task title and retry, e.g.:\n` +
        `  br update ${id} --title "Red: <shorter behavior>"\n` +
        `  npx tsx .claude/skills/ralph/commit-red.ts ${id}`
    );
    return 1;
  }

  // 3. Require at least one staged test file.
  const specs = stagedTestFiles(io.stagedFiles());
  if (specs.length === 0) {
    io.error(
      "commit-red: no staged test file (*.spec.ts / *.test.ts). " +
        "Stage the failing test (git add) before committing a RED task."
    );
    return 1;
  }

  // 4. Machine-verify RED: the staged spec files must FAIL.
  const passed = io.runVitest(specs);
  if (passed) {
    io.error(
      "commit-red: a RED commit must contain a failing test; these pass — did you mean a GREEN task?"
    );
    return 1;
  }

  // 5. Commit locally (sentinel skips ONLY vitest), no push.
  const message = buildCommitMessage(task.title, id);
  try {
    io.commit(message);
  } catch (err) {
    io.error(
      `commit-red: commit failed. The linters/type-check still run on a RED commit — ` +
        `this is NOT a bypass, fix the reported errors. ${String(err)}`
    );
    return 1;
  }
  io.log(`commit-red: committed failing test locally — "${message}". Not pushed.`);
  return 0;
}

/**
 * Builds the real IO boundary that shells out to br, git, and vitest.
 *
 * @returns A {@link CommitRedIo} backed by child processes.
 */
function makeRealIo(): CommitRedIo {
  return {
    showTask(id: string): BeadsTask | null {
      let raw: string;
      try {
        raw = execFileSync("br", ["show", id, "--json"], { encoding: "utf8" });
      } catch {
        return null;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      const record = Array.isArray(parsed) ? parsed[0] : parsed;
      if (record === undefined || record === null || typeof record !== "object") {
        return null;
      }
      const obj = record as Record<string, unknown>;
      const title = typeof obj["title"] === "string" ? obj["title"] : "";
      const description = typeof obj["description"] === "string" ? obj["description"] : "";
      return { title, description };
    },
    stagedFiles(): string[] {
      const out = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" });
      return out
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    },
    runVitest(specFiles: string[]): boolean {
      try {
        execFileSync("npx", ["vitest", "run", ...specFiles], { stdio: "inherit" });
        return true;
      } catch {
        return false;
      }
    },
    commit(message: string): void {
      // No --no-verify: the full hook runs; the sentinel only skips vitest.
      execFileSync("git", ["commit", "-m", message], {
        stdio: "inherit",
        env: { ...process.env, [RED_COMMIT_ENV]: RED_COMMIT_SENTINEL },
      });
    },
    error(message: string): void {
      process.stderr.write(message + "\n");
    },
    log(message: string): void {
      process.stdout.write(message + "\n");
    },
  };
}

/**
 * Entry point: wire the real IO boundary to {@link run} and set the exit code.
 */
function main(): void {
  process.exitCode = run(process.argv.slice(2), makeRealIo());
}

// Run main only when executed directly (not when imported by the test suite).
if (process.argv[1]?.endsWith("commit-red.ts") === true) {
  main();
}
