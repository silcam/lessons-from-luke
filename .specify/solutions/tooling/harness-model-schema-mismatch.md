# Model Returns Wrong Schema When Behavior Is Already Implemented

**Category**: tooling
**Date**: 2026-03-31
**Feature**: 017-hank-tdd-harness
**Tags**: harness, tdd, schema-validation, already-implemented, sonnet

## Problem

During Hank's RED step, the model is asked to write a failing test. When the behavior is already implemented, the model recognizes this and responds with `{"files":[], "reasoning":"already implemented..."}` — a Green/Refactor-shaped response instead of the expected Red response (`{"file":"...", "testName":"...", "testCode":"...", "reasoning":"..."}`). The harness sees "missing file path" and reports a failure instead of detecting the skip.

This happens because `--json-schema` constrains the output shape but the model still uses whatever schema feels most appropriate for its answer. When the model wants to say "nothing to do," it gravitates toward response shapes with empty `files` arrays.

## Root Cause

The model interprets the semantic intent of the task (write a test for something already working) and responds with the most natural shape for "no changes needed," ignoring the schema constraint for the RED step. The `--json-schema` flag enforces structure but not semantic correctness — the model can return valid JSON that satisfies a different step's schema.

## Solution

Two-level already-implemented detection:

1. **Oracle-level** (already works): If the model writes a test and it passes, the harness detects this as "already implemented" and skips GREEN/REFACTOR.

2. **Response-level** (needs implementation): Before checking the file path, examine the response for signals that the model believes the behavior is already implemented:
   - `reasoning` field contains "already implemented", "already exists", "no changes needed"
   - `files` array is empty (for Green/Refactor-shaped responses)
   - `testCode` is empty or absent

   When detected, treat as a skip: log it, increment `behaviorsSkipped`, continue to next behavior.

## Prevention

- **During spec phase**: When designing harness step schemas, include an explicit "skip" signal in every schema (e.g., `{"skip": true, "reasoning": "..."}`) so the model has a valid way to say "nothing to do" within the expected shape.
- **During plan phase**: Any harness that drives a model through sequential steps must account for the model recognizing that a step is unnecessary. The harness should provide a graceful exit path at every step, not just at the oracle level.
- **During review**: Check that all schema-constrained model calls handle the case where the model's semantic intent doesn't match the expected step.

## Related

- [Claude CLI Prompts Must Be Piped via stdin](claude-cli-stdin-piping.md)
