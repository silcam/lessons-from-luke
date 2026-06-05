# Ralph ATDD Routing Blocks Acceptance-Spec-Only Tasks

**Category**: tooling
**Date**: 2026-03-27
**Feature**: 016-area-context-commands
**Tags**: ralph, atdd, acceptance-tests, task-naming

## Problem

After feature implementation was complete, tasks were created to write acceptance specs and bind them to the existing code. Tasks were titled with `US` prefixes (e.g., "US1: Write and bind acceptance tests for Create Area").

Ralph routed these tasks into the ATDD inner cycle, which prompted Claude with: "Write the SMALLEST failing unit test that moves toward passing the acceptance tests."

Since the feature was already fully implemented with passing unit tests, Claude correctly signaled `already_implemented: true, test_written: false`. Ralph then closed the ATDD cycle without doing any work — the acceptance specs were never written and the tasks remained open.

For one task (US4), Claude did manage to write the spec and generate stubs, but the baseline test run failed because the unbound stubs throw `"acceptance test not yet bound"`, blocking the GREEN step.

## Root Cause

Ralph uses a title-based heuristic to detect ATDD tasks: any task title starting with `US` (matching `US<N>` pattern) gets routed to the ATDD cycle. The ATDD cycle assumes the task involves implementing new functionality through red-green-refactor, but these tasks were about writing acceptance specs for already-implemented code.

The ATDD inner cycle's RED step prompt is fundamentally incompatible with "write specs and bind them" work — it asks for a failing unit test, not for writing GWT spec files and running the acceptance pipeline.

## Solution

Rename the tasks to drop the `US` prefix so ralph routes them as normal (non-ATDD) tasks:

```bash
# Before (routed to ATDD cycle):
br update <id> --title "US1: Write and bind acceptance tests for Create Area"

# After (routed as normal task):
br update <id> --title "Write and bind acceptance tests for Create Area"
```

Also reopen the parent implement task (`sp:07-implement`) if it was previously closed, since ralph won't traverse into closed parents to find new child tasks.

## Prevention

- **Task naming rule**: Only use the `US<N>` prefix for tasks that involve implementing new functionality through TDD. Tasks that write/bind acceptance specs for already-implemented code should NOT use the `US` prefix.
- **Post-implementation acceptance tasks**: When creating tasks to retroactively add acceptance specs after implementation is complete, use descriptive titles like "Write and bind acceptance tests for {feature}" without any `US` prefix.
- **Parent task state**: When adding new child tasks under a closed parent, remember to reopen the parent first so ralph can discover the children.

## Related

- [Two Kinds of Remediation Tasks](remediation-task-classification.md) — related pattern of task classification affecting ralph routing
