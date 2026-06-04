# Claude CLI Prompts Must Be Piped via stdin

**Category**: tooling
**Date**: 2026-03-31
**Feature**: 017-hank-tdd-harness
**Tags**: claude-cli, child_process, spawn, stdin, argument-length

## Problem

When invoking `claude -p "long prompt..." --output-format json` via `child_process.execFile`, the CLI warns "no stdin data received in 3s" and either returns empty results or hangs. This happens intermittently — short prompts (GATHER, ANALYZE) succeed, but longer prompts (RED step with gathered file contents) fail.

## Root Cause

OS argument length limits (typically 128KB-2MB depending on platform) silently truncate long CLI arguments. When the prompt is passed as a `-p` argument and exceeds this limit, the claude CLI receives a truncated prompt, falls back to reading from stdin, and times out waiting for data that never arrives.

## Solution

Use `spawn` instead of `execFile` and pipe the prompt via stdin:

```typescript
import { spawn } from "node:child_process";

const child = spawn("claude", ["-p", "-", "--output-format", "json", "--model", "sonnet"], {
  stdio: ["pipe", "pipe", "pipe"],
  timeout,
});

child.stdin.write(prompt);
child.stdin.end();
```

The `-p -` flag tells claude to read the prompt from stdin. The `spawn` API supports piping to `child.stdin`.

## Prevention

- **During plan phase**: When designing CLI wrappers for LLM tools, always pipe via stdin. Never pass prompts as CLI arguments — they grow unpredictably with context.
- **During implementation**: If using `execFile` for any CLI that accepts text input, evaluate whether the input could exceed argument length limits. If yes, switch to `spawn` with stdin pipe.
- **During review**: Flag any `execFile` call where a parameter contains user/model-generated text of unbounded length.

## Related

- `--json-schema` flag enables `structured_output` in the claude CLI response envelope, which is more reliable than parsing the `result` string.
