---
name: code-review
description: In-band parallel code review (security, quality, architecture) over selected files via the Agent tool. Creates beads tasks for findings. Runs in the main session — no background process, no review.sh, no claude -p.
---

# Code Review (in-band)

> **Run this from the main conversation.** It fans out review subagents via the
> Agent tool; a subagent cannot dispatch subagents, so the orchestration must run
> in the main session.

Reviews selected TypeScript files across three dimensions — security, quality,
architecture — by dispatching review subagents **in parallel via the Agent
tool**, then files each finding as a beads task. There is no `review.sh`, no
background process, and no `claude -p` child: the orchestration runs in this
session and the live session is the monitor.

## Quick usage

```
/code-review                       # Review all TypeScript files
/code-review dry run               # List what would be reviewed, then stop
/code-review the files we changed  # Review staged files
/code-review security only         # Only the security dimension
/code-review no architecture       # Security + quality, skip architecture
/code-review files src/auth.ts src/login.ts
```

## Scope vs /review-all

`/code-review` reviews **specific files** (auto-discovered or named) during the
dev loop. `/review-all` reviews the **branch diff** (base..HEAD) with the full
`sp-*-review` agents. Use this for iterative file-level checks; use `/review-all`
(or `/sp:08-harden`) before merge.

## Orchestration — what the main session does

### 1. Parse arguments

| You say                                | Effect                                               |
| -------------------------------------- | ---------------------------------------------------- |
| "dry run", "preview"                   | List files + dimensions, then STOP (no agents/tasks) |
| "the files we changed", "staged files" | files = `git diff --name-only --staged`              |
| "files X Y Z", "files src/\*\*/\*.ts"  | files = the given paths/globs                        |
| "security only", "just quality"        | dimensions = that one                                |
| "no architecture", "skip security"     | dimensions = the rest                                |

Default (no args): all three dimensions over all discovered files.

### 2. Discover files (when not explicitly given)

Scan `src/`, `tests/`, `functions/` for `*.ts`. Exclude `node_modules/`,
`.claude/`, `dist/`, and other build output. Skip files > 100 KB; warn (but still
review) files > 10 KB. If nothing matches: report "No TypeScript files found to
review" and stop.

### 3. Detect or create the epic (main session `br`)

- `git branch --show-current`; strip the numeric prefix (`001-feature` →
  `feature`).
- Find an open epic whose title contains the feature name. If it is closed and we
  have findings, reopen it. If none exists, `br create -t epic --description ...`.

### 4. Gather dedup context (main session `br`)

Query existing open tasks under the epic (`br list --json` / `br ready`) so
findings already tracked are not re-filed in step 6.

### 5. Dispatch review subagents — IN PARALLEL via the Agent tool

For each selected dimension, in a **single message with multiple Agent calls**
(haiku model for cost), dispatch one subagent. Each subagent runs its review
skill over the given file list and returns **structured findings only** — it does
NOT touch beads (the main session is the single beads writer, see step 6).

Dimension → review skill:

- **security** → `/security-review`
- **quality** → `/quality-review`
- **architecture** → `/clean-architecture-validator`

Prompt shape for each subagent (verbatim):

```
Run the <skill> review over exactly these files: <file list>.
Do NOT create beads tasks and do NOT run br. Return ONLY a JSON array of findings:
[{ "file": "...", "line": <number|null>, "severity": "Critical|High|Medium|Low",
   "title": "<short title>", "problem": "<what is wrong and why>",
   "fix": "<concrete fix>" }]
Return [] if you find nothing.
```

Run them in the **foreground** so every dimension's findings are back before
filing tasks. (For a very large file set, the main session may split one
dimension across several subagents by batching the file list — still one parallel
fan-out, still no per-subagent beads writes.)

### 6. File findings as beads tasks — main session, single serialized writer

For each returned finding not already covered by an open task (dedup by
file + title), `br create --parent <epic>`:

- Title: `[<dimension>] <finding title>`
- Description: file, line, severity, skill, problem, fix.
- Priority by severity: **Critical → 0, High → 1, Medium → 2, Low → 3**.

Filing in the main session rather than inside the three parallel subagents keeps
beads writes serialized — concurrent subagents each running `br create` is the
one scenario that races the local SQLite store.

### 7. Summary

```
## Code Review — Summary

Files reviewed: N     Dimensions: security, quality, architecture

| Dimension    | Findings | Tasks created | Highest severity |
| ------------ | -------- | ------------- | ---------------- |
| Security     | …        | …             | Critical/High/…  |
| Quality      | …        | …             | …                |
| Architecture | …        | …             | …                |

Total: X tasks under epic <epic-id>.  Run `br ready` to start.
```

Show "No issues found ✓" for any dimension that returned `[]`.

## When to use

- Iterative review while coding; a file-level check before staging or a PR.
- **Not** for branch-diff review — use `/review-all` or `/sp:08-harden`.
- **Not** for single-file quick checks — just ask Claude directly.

## Notes

- Cost: review subagents use the **haiku** model by default. If the user asks for
  a "thorough" or "deep" review, dispatch them with a stronger model instead.
- No lock file, no `.review.log`, no retry plumbing: the Agent tool manages
  concurrency and the live session is the monitor. `^C` cancels in-flight agents.
