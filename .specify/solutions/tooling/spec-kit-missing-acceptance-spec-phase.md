# Spec-Kit Workflow Missing Acceptance Spec Phase

**Category**: tooling
**Date**: 2026-03-27
**Feature**: 016-area-context-commands
**Tags**: spec-kit, atdd, acceptance-tests, workflow-gap

## Problem

Feature 016-area-context-commands completed all spec-kit phases (sp:02 through sp:10) and all implementation tasks, but no acceptance spec files were ever written in `specs/acceptance-specs/`. The spec had detailed GWT acceptance scenarios for all 5 user stories, but they were never converted into acceptance spec files that the pipeline could parse, generate stubs from, and bind.

This was only discovered when trying to create a PR — the acceptance tests that "define done" (per CLAUDE.md) didn't exist.

## Root Cause

The spec-kit workflow has no explicit phase for writing acceptance spec files. The phases are:

1. sp:02-specify — writes the spec (including GWT acceptance scenarios) and clarifies requirements
2. sp:03-plan — creates implementation plan
3. sp:04-red-team — adversarial review
4. sp:05-tasks — generates implementation tasks
5. sp:06-analyze — validates artifacts
6. sp:07-implement — executes implementation (with ATDD for US tasks)
7. sp:08/09/10 — reviews

The GWT scenarios are written in sp:01 as prose in the spec, but they're never extracted into the structured `.txt` format that the acceptance pipeline requires (`specs/acceptance-specs/US*.txt`).

CLAUDE.md mandates ATDD: "User story tasks (`US<N>` prefix) use Acceptance Test-Driven Development. Acceptance tests define done." Ralph's ATDD cycle assumes acceptance specs already exist when it hits a `US<N>` task — it starts with RED (write a failing unit test), expecting the outer acceptance loop to already be set up. But nothing in the workflow creates the outer loop.

The chain of assumptions:

- sp:02 writes acceptance scenarios as spec prose
- sp:05 creates US tasks expecting ATDD
- sp:07/ralph expects acceptance specs to exist for US tasks
- Nobody converts spec prose → acceptance spec files

## Solution

The acceptance spec files should be created as part of `sp:05-tasks` (or a new phase between sp:05 and sp:07). When sp:05 generates US implementation tasks, it should also:

1. Extract each user story's GWT acceptance scenarios from the spec
2. Write them as structured `.txt` files in `specs/acceptance-specs/`
3. Run the acceptance pipeline to generate stubs
4. Verify the stubs fail (RED — "acceptance test not yet bound")

This way, when ralph hits a `US<N>` task during sp:07, the outer acceptance loop is already set up and the ATDD inner cycle (unit TDD) can proceed correctly.

## Prevention

- **sp:05-tasks skill** should include a step to create acceptance spec files from the spec's GWT scenarios
- **sp:06-analyze** should verify that every US task has a corresponding acceptance spec file
- **sp:03-plan** should mention the ATDD outer loop and reference the acceptance spec files that will be created
- As a safety net, ralph could check for the existence of acceptance spec files before routing a US task to the ATDD cycle, and create them if missing

## Related

- [Ralph ATDD Routing Blocks Acceptance-Spec-Only Tasks](ralph-atdd-routing-blocks-spec-only-tasks.md) — the downstream symptom when trying to retrofit acceptance specs after implementation
- [Two Kinds of Remediation Tasks](remediation-task-classification.md) — related pattern of work items falling through workflow gaps
