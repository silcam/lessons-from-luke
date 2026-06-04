/**
 * Result of evaluating a command against guard rules.
 *
 * Discriminated union: 'allow' has no message, 'block' includes a message.
 */
export type GuardResult =
  | { action: 'allow'; message?: undefined }
  | { action: 'block'; message: string };

/**
 * A named pattern defining a blocked command.
 *
 * Includes category, regex pattern, optional safe-pattern whitelist,
 * and an error message template.
 */
export interface GuardRule {
  /** Human-readable rule name. */
  name: string;
  /** Category grouping (e.g., 'destructive-git', 'platform-ops'). */
  category: string;
  /** Regex that triggers a block when matched. */
  pattern: RegExp;
  /** Whitelist regexes checked before the destructive pattern. */
  safePatterns?: RegExp[];
  /** Error message displayed when the command is blocked. */
  message: string;
}

/** Rules checked against the raw command (before quote stripping). */
export const PRE_STRIP_RULES: readonly GuardRule[] = [
  {
    name: 'hook-bypass',
    category: 'hook-bypass',
    pattern: /git\s+.*(--no-verify|--no-gpg-sign)/,
    message: `BLOCKED: Hook bypass flags detected.

Prohibited flags: --no-verify, --no-gpg-sign

Instead of bypassing safety checks:
- If pre-commit hook fails: Fix the linting/formatting/type errors it found
- If commit-msg fails: Write a proper conventional commit message
- If pre-push fails: Fix the issues preventing push

Fix the root problem rather than bypassing the safety mechanism.
Only use these flags when explicitly requested by the user.`,
  },
  {
    name: 'force-push',
    category: 'destructive-git',
    pattern: /git\s+push.*(--force([^-]|$)|-f(\s|$)|--force-with-lease)/,
    message: `BLOCKED: Force push detected.

Force pushing rewrites remote history and can destroy teammates' work.

Instead:
- Use normal \`git push\` to push changes safely
- If rejected, pull and merge first: \`git pull --rebase\` then \`git push\`
- Only use force push when explicitly requested by the user`,
  },
];

/** Rules checked against the quote-stripped command. */
export const POST_STRIP_RULES: readonly GuardRule[] = [
  {
    name: 'reset-hard',
    category: 'destructive-git',
    pattern: /git\s+reset\s+--hard/,
    message: `BLOCKED: git reset --hard detected.

This command discards all uncommitted changes with no recovery path.

Instead:
- Use \`git stash\` to save changes temporarily
- Use \`git reset --soft HEAD~1\` to undo a commit but keep changes
- Use \`git checkout -- <file>\` to discard changes in a specific file`,
  },
  {
    name: 'checkout-dot',
    category: 'destructive-git',
    pattern: /git\s+checkout\s+(--\s+)?\.(\s|$)/,
    message: `BLOCKED: git checkout . detected (discard all changes).

This command discards all uncommitted changes across every file.

Instead:
- Use \`git checkout -- <file>\` to discard changes in a specific file
- Use \`git stash\` to save changes temporarily
- Use \`git diff\` to review changes before discarding`,
  },
  {
    name: 'checkout-treeish-dot',
    category: 'destructive-git',
    pattern: /git\s+checkout\s+.*--\s+\.(\s|$)/,
    message: `BLOCKED: git checkout <tree-ish> -- . detected (overwrite all files).

This command overwrites all working tree files from another commit.

Instead:
- Use \`git checkout <tree-ish> -- <file>\` to restore a specific file
- Use \`git diff <tree-ish>\` to review differences first
- Use \`git stash\` to save current changes before restoring`,
  },
  {
    name: 'restore-dot',
    category: 'destructive-git',
    pattern: /git\s+restore\s+\.(\s|$)/,
    safePatterns: [/git\s+restore\s+--staged/, /git\s+restore\s+-S/],
    message: `BLOCKED: git restore . detected (discard all changes).

This command discards all uncommitted changes across every file.

Instead:
- Use \`git restore <file>\` to discard changes in a specific file
- Use \`git restore --staged <file>\` to unstage specific files
- Use \`git stash\` to save changes temporarily`,
  },
  {
    name: 'clean-force',
    category: 'destructive-git',
    pattern: /git\s+clean\s+.*-[a-zA-Z]*f/,
    safePatterns: [/git\s+clean\s+.*-[a-zA-Z]*n/, /git\s+clean\s+.*--dry-run/],
    message: `BLOCKED: git clean -f detected (delete untracked files).

This command permanently deletes untracked files with no recovery path.

Instead:
- Use \`git clean -n\` to preview what would be deleted (dry run)
- Use \`git clean --dry-run\` for the same preview
- Manually remove specific files you no longer need`,
  },
  {
    name: 'legacy-bd',
    category: 'platform-ops',
    pattern: /(?:^|&&|\|\||[;(|])\s*(?:npx\s+)?bd(?:\s|$)/mu,
    message: `BLOCKED: \`bd\` (legacy beads) is not permitted. Use \`br\` (beads_rust) instead.

This project has migrated from @beads/bd to beads_rust.

Replace:
  npx bd <subcommand>
  bd <subcommand>

With:
  br <subcommand>`,
  },
  {
    name: 'br-init-force',
    category: 'platform-ops',
    pattern: /\bbr\s+init\b.*(-f\b|--force\b)/u,
    message: `BLOCKED: br init --force is not permitted.

Reinitializing the beads database would destroy all issue history.

Instead:
- Use \`br init\` without --force to initialize safely
- Use \`br status\` to check current beads state
- Have the user run this manually if a force-reset is genuinely needed`,
  },
  {
    name: 'commit-amend',
    category: 'destructive-git',
    pattern: /git\s+commit\s+.*--amend/,
    message: `BLOCKED: git commit --amend detected (amending commits is prohibited).

CLAUDE.md explicitly states "NEVER amend commits" — create a new commit instead.
Amending after a failed pre-commit hook can destroy the previous commit's changes.

Instead:
- Always create a new commit for changes
- Use \`git reset --soft HEAD~1\` to undo a commit without losing changes
- Have the user run interactive rebase manually if reorganizing history is needed`,
  },
  {
    name: 'merge-squash',
    category: 'destructive-git',
    pattern: /git\s+merge\s+.*--squash/,
    message: `BLOCKED: git merge --squash detected (squash-merging is prohibited).

CLAUDE.md explicitly states "NEVER squash-merge" — preserve full commit history.
Squash-merging destroys PR commit history and makes debugging harder.

Instead:
- Use normal \`git merge\` to preserve commit history
- Use \`git merge --no-ff\` to ensure a merge commit is created
- Have the user perform interactive rebase manually if needed`,
  },
  {
    name: 'stash-drop',
    category: 'destructive-git',
    pattern: /git\s+stash\s+drop(?:\s|$)/,
    message: `BLOCKED: git stash drop detected.

This command permanently deletes a stash entry with no recovery path.

Instead:
- Use \`git stash list\` to review stashes before dropping
- Use \`git stash apply\` to apply without removing the stash
- Use \`git stash pop\` to apply and remove only after confirming the stash contents`,
  },
  {
    name: 'stash-clear',
    category: 'destructive-git',
    pattern: /git\s+stash\s+clear(?:\s|$)/,
    message: `BLOCKED: git stash clear detected.

This command permanently deletes all stash entries with no recovery path.

Instead:
- Use \`git stash list\` to review stashes before clearing
- Use \`git stash drop stash@{N}\` to remove specific stashes one at a time
- Use \`git stash apply\` to recover work from a stash before removing it`,
  },
  {
    name: 'branch-force-delete',
    category: 'destructive-git',
    pattern: /git\s+branch\s+-D(?:\s|$)/,
    message: `BLOCKED: git branch -D detected (force-delete unmerged branch).

This command deletes a branch even if it has unmerged changes, potentially losing work.

Instead:
- Use \`git branch -d <branch>\` to safely delete only fully-merged branches
- Use \`git log <branch>\` to review commits before deleting
- Use \`git merge <branch>\` to merge changes before deleting`,
  },
  {
    name: 'catastrophic-rm',
    category: 'catastrophic-file-deletion',
    pattern:
      /rm\s+(?:-[a-zA-Z]*(?:rf|fr)[a-zA-Z]*|-[a-zA-Z]*r\s+-[a-zA-Z]*f|-[a-zA-Z]*f\s+-[a-zA-Z]*r|--recursive\s+--force|--force\s+--recursive)\s+(?:\$\{HOME\}|\$HOME|\.\.\/|\.\/|~\/|\/|~|\.|\*)(?:\s|$)/,
    message: `BLOCKED: Catastrophic rm detected — targets system-critical path.

This command would recursively force-delete a critical path (root, home, current directory, or all files) with no recovery.

Instead:
- Use \`rm -rf <specific-directory>\` to remove a known directory (e.g., node_modules, dist)
- Use \`ls <path>\` to verify what would be affected first
- Never use rm -rf with /, ., ~, ../, *, $HOME, or similar broad targets`,
  },
];

/** Rules checked against the raw command for platform-specific operations. */
export const PLATFORM_RULES: readonly GuardRule[] = [
  {
    name: 'gh-repo-delete',
    category: 'platform-ops',
    pattern: /gh\s+repo\s+delete/,
    message: `BLOCKED: gh repo delete detected.

This command destroys the entire GitHub repository with no recovery path.

Instead:
- Use the GitHub web UI if you truly need to delete a repository
- Use \`gh repo archive\` to archive instead of deleting
- Confirm with the user before taking any repository-level destructive action`,
  },
  {
    name: 'wrangler-delete',
    category: 'platform-ops',
    pattern: /wrangler\s+delete/,
    message: `BLOCKED: wrangler delete detected.

This command deletes the Cloudflare Worker and all associated configuration.

Instead:
- Use \`wrangler deploy\` to update the worker
- Use the Cloudflare dashboard if you truly need to delete a worker
- Confirm with the user before taking any worker-level destructive action`,
  },
  {
    name: 'd1-drop',
    category: 'platform-ops',
    pattern: /wrangler\s+d1\s+execute\b.*\bDROP\b/i,
    message: `BLOCKED: Destructive D1 SQL detected (DROP).

DROP permanently removes database objects with no recovery path.

Instead:
- Use \`wrangler d1 migrations apply\` with a proper migration file
- Back up the database before making schema changes
- Confirm with the user before executing destructive SQL`,
  },
  {
    name: 'd1-truncate',
    category: 'platform-ops',
    pattern: /wrangler\s+d1\s+execute\b.*\bTRUNCATE\b/i,
    message: `BLOCKED: Destructive D1 SQL detected (TRUNCATE).

TRUNCATE permanently removes all rows from a table with no recovery path.

Instead:
- Use DELETE FROM with a WHERE clause to remove specific rows
- Back up the database before bulk deletions
- Confirm with the user before executing destructive SQL`,
  },
  {
    name: 'd1-delete-no-where',
    category: 'platform-ops',
    pattern: /wrangler\s+d1\s+execute\b.*\bDELETE\s+FROM\b/i,
    safePatterns: [/wrangler\s+d1\s+execute\b.*\bDELETE\s+FROM\b[^"]*\bWHERE\b/i],
    message: `BLOCKED: Destructive D1 SQL detected (DELETE FROM without WHERE).

DELETE FROM without a WHERE clause removes all rows from the table.

Instead:
- Add a WHERE clause to target specific rows
- Back up the database before bulk deletions
- Confirm with the user before executing destructive SQL`,
  },
  {
    name: 'd1-execute-file',
    category: 'platform-ops',
    pattern: /wrangler\s+d1\s+execute\b.*--file/,
    message: `BLOCKED: wrangler d1 execute --file detected.

Executing SQL from a file bypasses inline content inspection and may contain
destructive statements (DROP, TRUNCATE, DELETE) that cannot be verified.

Instead:
- Use \`wrangler d1 migrations apply\` for schema changes
- Use \`wrangler d1 execute --command\` with specific SQL statements
- Review the SQL file contents before executing`,
  },
];

/**
 * Normalizes a command by collapsing line continuations and stripping
 * command wrappers (sudo, env, command, nohup, exec, time, nice, leading backslash).
 *
 * Line continuations are collapsed first (S9), then wrappers are
 * iteratively stripped using a do-while loop until the string stabilizes (Fix 1).
 *
 * @param command - The raw command string.
 * @returns The normalized command with wrappers removed.
 */
export function normalizeCommand(command: string): string {
  // S9: collapse line continuations first
  let result = command.replace(/\\\n\s*/g, ' ');
  // Strip leading backslash (separate from continuations)
  result = result.replace(/^\\/, '');
  // Fix 1: iterative loop for chained/doubled wrappers
  let prev: string;
  do {
    prev = result;
    result = result
      .replace(/^(sudo|command|nohup|exec|time|nice)\s+/, '')
      .replace(/^env\s+(\w+=\S+\s+)*/, '');
  } while (result !== prev);
  return result;
}

/**
 * Strips quoted content from a command to prevent false positives.
 *
 * Removes heredocs, double-quoted strings, and single-quoted strings,
 * replacing them with empty placeholders.
 *
 * @param command - The raw command string.
 * @returns The command with quoted content replaced.
 */
export function stripQuotedContent(command: string): string {
  return command
    .replace(/<<-?'?(\w+)'?\n[\s\S]*?\n\s*\1/gu, '') // heredocs
    .replace(/"(?:[^"\\]|\\.)*"/gu, '""')
    .replace(/'[^']*'/gu, "''"); // single-quoted strings
}

/**
 * Splits a command string on shell separators after quote stripping.
 *
 * Splits on &&, ||, ;, and | so each sub-command can be evaluated
 * independently, preventing safe-pattern cross-contamination (S6).
 *
 * @param command - The quote-stripped command string.
 * @returns An array of sub-command strings.
 */
export function splitCommands(command: string): string[] {
  return command.split(/\s*(?:&&|\|\||[;|])\s*/).filter((s) => s.length > 0);
}

/** Fast prefix regex to detect shell interpreter wrappers. */
const SHELL_WRAPPER_RE = /^(?:bash|sh|zsh|dash)\s+-c\s+/;

/** Fast prefix regex to detect eval wrappers. */
const EVAL_WRAPPER_RE = /^eval\s+/;

/**
 * Extracts the payload from a shell wrapper command.
 *
 * Strips the wrapper prefix and unquotes the remaining payload
 * (single-quoted, double-quoted, or unquoted).
 *
 * @param command - The normalized command after wrapper prefix detection.
 * @param prefix - The regex that matched the wrapper prefix.
 * @returns The extracted payload string, or null if extraction fails.
 */
function extractShellPayload(command: string, prefix: RegExp): string | null {
  const stripped = command.replace(prefix, '');
  if (stripped.length === 0) {
    return null;
  }
  const first = stripped[0];
  if (first === '"') {
    // Double-quoted: scan forward for first unescaped closing quote
    let i = 1;
    while (i < stripped.length) {
      if (stripped[i] === '\\' && i + 1 < stripped.length) {
        i += 2; // skip escaped character
        continue;
      }
      if (stripped[i] === '"') {
        return stripped.slice(1, i).replace(/\\"/g, '"');
      }
      i++;
    }
    // No closing quote found
    return stripped.slice(1);
  }
  if (first === "'") {
    // Single-quoted: no escape sequences, find first closing quote
    const end = stripped.indexOf("'", 1);
    if (end > 0) {
      return stripped.slice(1, end);
    }
    return stripped.slice(1);
  }
  // Unquoted payload
  return stripped;
}

/** Maximum recursion depth for shell wrapper unwrapping. */
const MAX_SHELL_DEPTH = 1;

/**
 * Internal recursive implementation of command evaluation.
 *
 * First normalizes the command (collapsing line continuations and stripping
 * wrappers like sudo/env/command). Then checks PRE_STRIP_RULES, PLATFORM_RULES,
 * shell wrapper detection (two-pass per S5/S8), and finally strips quoted
 * content, splits on shell separators, and checks POST_STRIP_RULES against
 * each sub-command independently.
 *
 * @param command - The raw command string from tool_input.command.
 * @param depth - Remaining recursion depth for shell wrapper detection.
 * @returns A GuardResult indicating whether the command is allowed or blocked.
 */
function evaluateCommandInner(command: string, depth: number): GuardResult {
  const normalized = normalizeCommand(command);

  if (normalized.trim() === '') {
    return { action: 'allow' };
  }

  for (const rule of PRE_STRIP_RULES) {
    if (rule.safePatterns?.some((sp) => sp.test(normalized)) === true) {
      continue;
    }
    if (rule.pattern.test(normalized)) {
      return { action: 'block', message: rule.message };
    }
  }

  for (const rule of PLATFORM_RULES) {
    if (rule.safePatterns?.some((sp) => sp.test(normalized)) === true) {
      continue;
    }
    if (rule.pattern.test(normalized)) {
      return { action: 'block', message: rule.message };
    }
  }

  // S5/S8: two-pass shell wrapper detection (skipped at depth < 0)
  if (depth >= 0) {
    let payload: string | null = null;
    if (SHELL_WRAPPER_RE.test(normalized)) {
      payload = extractShellPayload(normalized, SHELL_WRAPPER_RE);
    } else if (EVAL_WRAPPER_RE.test(normalized)) {
      payload = extractShellPayload(normalized, EVAL_WRAPPER_RE);
    }
    if (payload !== null) {
      const innerResult = evaluateCommandInner(payload, depth - 1);
      if (innerResult.action === 'block') {
        return innerResult;
      }
    }
  }

  const stripped = stripQuotedContent(normalized);
  const subCommands = splitCommands(stripped);

  for (const sub of subCommands) {
    for (const rule of POST_STRIP_RULES) {
      if (rule.safePatterns?.some((sp) => sp.test(sub)) === true) {
        continue;
      }
      if (rule.pattern.test(sub)) {
        return { action: 'block', message: rule.message };
      }
    }
  }

  return { action: 'allow' };
}

/**
 * Evaluates a command string against all guard rules.
 *
 * Delegates to an internal recursive implementation with a fixed recursion
 * depth for shell wrapper detection. The recursion depth is not configurable
 * by callers.
 *
 * @param command - The raw command string from tool_input.command.
 * @returns A GuardResult indicating whether the command is allowed or blocked.
 */
export function evaluateCommand(command: string): GuardResult {
  return evaluateCommandInner(command, MAX_SHELL_DEPTH);
}
