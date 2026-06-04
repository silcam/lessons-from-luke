import { describe, expect, it } from 'vitest';

import type { BeadsTask, CommitRedIo } from './commit-red';
import {
  buildCommitMessage,
  buildSubject,
  HEADER_MAX_LENGTH,
  isRedTask,
  isTestFile,
  RED_COMMIT_ENV,
  RED_COMMIT_SENTINEL,
  run,
  stagedTestFiles,
} from './commit-red';

/** A recording fake IO with sensible RED-task defaults, overridable per test. */
interface FakeIo extends CommitRedIo {
  /** Lines captured from io.error(). */
  readonly errors: string[];
  /** Lines captured from io.log(). */
  readonly logs: string[];
  /** Messages passed to io.commit(). */
  readonly commits: string[];
  /** The spec-file lists passed to io.runVitest(). */
  readonly vitestCalls: string[][];
}

const RED_TASK: BeadsTask = {
  title: 'Red: write failing test for user validation',
  description: '**Type**: RED (write failing test)',
};

/**
 * Build a recording fake IO. Defaults model the happy path (a real RED task,
 * one staged failing spec, a clean commit). Override any slice per test.
 *
 * @param overrides - Partial IO behaviour to merge over the defaults.
 * @returns A recording {@link FakeIo}.
 */
function makeFakeIo(overrides: Partial<CommitRedIo> = {}): FakeIo {
  const errors: string[] = [];
  const logs: string[] = [];
  const commits: string[] = [];
  const vitestCalls: string[][] = [];
  const base: CommitRedIo = {
    showTask: () => RED_TASK,
    stagedFiles: () => ['src/domain/user.spec.ts', 'src/domain/user.ts'],
    runVitest: (specFiles) => {
      vitestCalls.push(specFiles);
      return false; // default: tests fail (a genuine RED)
    },
    commit: (message) => {
      commits.push(message);
    },
    error: (message) => {
      errors.push(message);
    },
    log: (message) => {
      logs.push(message);
    },
  };
  return { ...base, ...overrides, errors, logs, commits, vitestCalls };
}

describe('isRedTask', () => {
  it('matches a Red: title prefix (case-insensitive)', () => {
    expect(isRedTask({ title: 'RED: do thing', description: '' })).toBe(true);
    expect(isRedTask({ title: '  red: do thing', description: '' })).toBe(true);
  });

  it('matches a **Type**: RED description marker', () => {
    expect(
      isRedTask({ title: 'Implement thing', description: '**Type**: RED (write failing test)' })
    ).toBe(true);
  });

  it('rejects non-RED tasks', () => {
    expect(isRedTask({ title: 'Green: make thing pass', description: '**Type**: GREEN' })).toBe(
      false
    );
  });
});

describe('isTestFile', () => {
  it('accepts .spec.ts and .test.ts', () => {
    expect(isTestFile('src/foo.spec.ts')).toBe(true);
    expect(isTestFile('src/foo.test.ts')).toBe(true);
  });

  it('rejects non-test files', () => {
    expect(isTestFile('src/foo.ts')).toBe(false);
    expect(isTestFile('migrations/0001_init.sql')).toBe(false);
  });
});

describe('stagedTestFiles', () => {
  it('keeps only test files, preserving order', () => {
    expect(stagedTestFiles(['src/a.ts', 'src/a.spec.ts', 'src/b.test.ts', 'README.md'])).toEqual([
      'src/a.spec.ts',
      'src/b.test.ts',
    ]);
  });
});

describe('buildSubject', () => {
  it('strips the Red: prefix and appends [skip ci], with no id in the subject', () => {
    expect(buildSubject('Red: write failing test for X')).toBe(
      'test: red — write failing test for X [skip ci]'
    );
  });

  it('falls back when the title is only the prefix', () => {
    expect(buildSubject('Red:')).toBe('test: red — write failing test [skip ci]');
  });

  it('a 78-char behavior yields a subject of exactly HEADER_MAX_LENGTH', () => {
    expect(buildSubject('a'.repeat(78)).length).toBe(HEADER_MAX_LENGTH);
  });

  it('one char longer than the budget exceeds HEADER_MAX_LENGTH', () => {
    expect(buildSubject('a'.repeat(79)).length).toBeGreaterThan(HEADER_MAX_LENGTH);
  });
});

describe('buildCommitMessage', () => {
  it('carries the id in a Refs: footer rather than the subject', () => {
    expect(buildCommitMessage('Red: write failing test for X', 'tb-1')).toBe(
      'test: red — write failing test for X [skip ci]\n\nRefs: tb-1'
    );
  });

  it('falls back when the title is only the prefix', () => {
    expect(buildCommitMessage('Red:', 'tb-2')).toBe(
      'test: red — write failing test [skip ci]\n\nRefs: tb-2'
    );
  });

  it('produces a conventional test: header within the length budget for a normal title', () => {
    const message = buildCommitMessage('Red: validate email format', 'turtlebased-ts-ab12');
    expect(message.startsWith('test: ')).toBe(true);
    expect(buildSubject('Red: validate email format').length).toBeLessThanOrEqual(
      HEADER_MAX_LENGTH
    );
  });
});

describe('run', () => {
  it('refuses when the task ID is missing', () => {
    const io = makeFakeIo();
    expect(run([], io)).toBe(1);
    expect(io.errors[0]).toContain('missing required task ID');
    expect(io.commits).toHaveLength(0);
  });

  it('refuses when the task ID is blank', () => {
    const io = makeFakeIo();
    expect(run(['   '], io)).toBe(1);
    expect(io.errors[0]).toContain('missing required task ID');
  });

  it('refuses when the task does not exist', () => {
    const io = makeFakeIo({ showTask: () => null });
    expect(run(['tb-x'], io)).toBe(1);
    expect(io.errors[0]).toContain('not found');
  });

  it('refuses a non-RED task with the fix-your-test message', () => {
    const io = makeFakeIo({ showTask: () => ({ title: 'Green: make X pass', description: '' }) });
    expect(run(['tb-1'], io)).toBe(1);
    expect(io.errors[0]).toContain('RED TDD task ONLY');
    expect(io.errors[0]).toContain('NOT a way to bypass failing tests');
    expect(io.commits).toHaveLength(0);
  });

  it('refuses when no test file is staged', () => {
    const io = makeFakeIo({ stagedFiles: () => ['src/domain/user.ts'] });
    expect(run(['tb-1'], io)).toBe(1);
    expect(io.errors[0]).toContain('no staged test file');
    expect(io.vitestCalls).toHaveLength(0);
  });

  it('refuses when the staged tests pass (looks like a GREEN task)', () => {
    const io = makeFakeIo({ runVitest: () => true });
    expect(run(['tb-1'], io)).toBe(1);
    expect(io.errors[0]).toContain('must contain a failing test');
    expect(io.commits).toHaveLength(0);
  });

  it('runs vitest against only the staged test files', () => {
    const io = makeFakeIo();
    run(['tb-1'], io);
    expect(io.vitestCalls).toEqual([['src/domain/user.spec.ts']]);
  });

  it('commits locally with [skip ci] + Refs footer and does not push on a genuine RED task', () => {
    const io = makeFakeIo();
    expect(run(['tb-1'], io)).toBe(0);
    expect(io.commits).toHaveLength(1);
    expect(io.commits[0]).toBe(
      'test: red — write failing test for user validation [skip ci]\n\nRefs: tb-1'
    );
    expect(io.logs[0]).toContain('Not pushed');
  });

  it('refuses an over-long title before staging, vitest, or commit', () => {
    const longTitle = `Red: ${'a'.repeat(120)}`;
    const io = makeFakeIo({
      showTask: () => ({ title: longTitle, description: '**Type**: RED' }),
    });
    expect(run(['tb-1'], io)).toBe(1);
    expect(io.errors[0]).toContain('too long');
    expect(io.errors[0]).toContain('br update tb-1');
    expect(io.commits).toHaveLength(0);
    expect(io.vitestCalls).toHaveLength(0);
  });

  it('surfaces a commit failure (linters/type-check still enforced)', () => {
    const io = makeFakeIo({
      commit: () => {
        throw new Error('eslint: no-explicit-any in src/domain/user.ts:42');
      },
    });
    expect(run(['tb-1'], io)).toBe(1);
    expect(io.errors[0]).toContain('NOT a bypass');
    expect(io.errors[0]).toContain('no-explicit-any');
  });
});

describe('sentinel constants', () => {
  it('exposes the env name and sentinel value the wrapper checks', () => {
    expect(RED_COMMIT_ENV).toBe('RALPH_RED_COMMIT');
    expect(RED_COMMIT_SENTINEL.length).toBeGreaterThan(0);
  });
});
