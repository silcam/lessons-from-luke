# Harness-Driven TDD Enables Smaller Models

**Category**: tooling
**Date**: 2026-03-31
**Feature**: 017-hank-tdd-harness
**Tags**: harness, tdd, sonnet, haiku, cost-reduction, autobe, oracles

## Problem

Delegating full TDD cycles to Opus (via ralph.sh or sp:07-implement) is slow, expensive, and undisciplined. The model ignores red-green-refactor instructions — writes many tests at once, makes large changes, and doesn't follow the smallest-step principle.

## Root Cause

Prompt instructions are suggestions, not constraints. A model told "write one test, then make it pass" has no external enforcement — it can and does write five tests and a full implementation in one shot. The discipline must come from the harness, not the prompt.

## Solution

Build a TypeScript harness (Hank) that drives each TDD micro-step mechanically:

1. **GATHER** (Haiku): Identify relevant files → harness reads them
2. **ANALYZE** (Sonnet): Decompose task into single-sentence behaviors
3. **Per behavior**:
   - **RED** (Sonnet): "Write ONE failing test" → harness writes file → oracle confirms failure
   - **GREEN** (Sonnet): "Write MINIMAL code to pass" → harness writes file → oracle confirms pass
   - **REFACTOR** (Haiku): "Refactor if needed" → harness writes file → oracle confirms still green
4. **VERIFY**: `npm run check` — full validation
5. **COMMIT/CLOSE**: One commit per task, close beads task

Key architectural decisions:

- **TypeScript, not bash**: Schema validation, Zod parsing, typed error feedback
- **Claude CLI via spawn + stdin pipe**: Preserves OAuth auth, no API key needed
- **`--json-schema` flag**: Enables `structured_output` in response envelope — far more reliable than parsing prose
- **Harness applies files**: Model returns code, harness writes to disk. No tool-use delegation.
- **Snapshot before GREEN**: If GREEN breaks tests, restore files from pre-GREEN state

First successful run: Sonnet completed a full RED→GREEN→REFACTOR cycle for adding `isSensitiveFile` guard to the GATHER loop, validated at each step by vitest oracle.

## Prevention

- **During spec phase**: When planning LLM-driven automation, design the harness to constrain each model call to one micro-step with a typed response schema and an external oracle. The model fills small holes; the harness enforces discipline.
- **During plan phase**: Consider model cost during architecture design. If the harness constrains the work tightly enough, Sonnet or Haiku can replace Opus for implementation tasks.
- **During review**: Flag any design where a model is given a large, unconstrained task. Ask: "Can this be decomposed into schema-validated micro-steps with oracle verification?"

## Related

- [Claude CLI Prompts Must Be Piped via stdin](claude-cli-stdin-piping.md)
- [Model Returns Wrong Schema When Behavior Is Already Implemented](harness-model-schema-mismatch.md)
- Inspired by [AutoBe Function Calling Harness](https://autobe.dev/blog/function-calling-harness-qwen-meetup-korea/) and [Nibzard Oracles](https://www.nibzard.com/oracles/)
