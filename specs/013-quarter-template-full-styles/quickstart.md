# Quickstart: Quarter Template Full Style-Family Application (013)

## What this feature does

Makes the assembled-quarter download apply the quarter styles template across
**all** style families with overwrite — reversing the 009 restriction that only
loaded paragraph/character styles. Result: lesson first pages lose the
stand-alone CC footer, lesson-opening spacing matches the quarter master, and the
per-lesson content footers, pagination, and TOC numbering still resolve.

## The change in one paragraph

In `src/server/assembly/macro/Module1.xba`, flip three flags in the
`loadStylesFromURL` call from `False` to `True`
(`LoadPageStyles`, `LoadFrameStyles`, `LoadNumberingStyles`), rewrite the
explanatory comment, regenerate `module1Xba.ts`, and re-verify the assembled
output via the golden-reference integration test (extended with FR-002/FR-003
assertions for both modes). No Node signatures change; no new files.

## Prerequisites

- LibreOffice `soffice` on PATH (existing prod dependency). Note: `soffice`
  hangs inside the Bash sandbox — run integration tests with the sandbox
  disabled and a localhost Postgres available (see MEMORY: `project_soffice_sandbox_hang`).
- Local test Postgres (`NODE_ENV=test`) for the integration suite.

## Make the change

1. Edit `src/server/assembly/macro/Module1.xba` — set `LoadPageStyles`,
   `LoadFrameStyles`, `LoadNumberingStyles` to `True`; rewrite the comment
   (see `contracts/template-application.md` §3).
2. Regenerate the embedded constant:
   ```bash
   node scripts/genMacroConstant.js
   ```
   (`module1Xba.test.ts` guards drift between `.xba` and `.ts`.)

## Verify (TDD outer loop — write the RED assertions first)

Integration suite (real `soffice`, serialized), sandbox disabled:

```bash
NODE_ENV=test npx jest src/server/actions/assembleQuarter.integration.test.ts --runInBand
```

New / re-verified axes (both bilingual and monolingual describe-blocks):

- **FR-002 (NEW):** no lesson first page renders a footer; CC text only in the
  TOC section.
- **FR-003 (NEW):** lesson-opening spacing matches the mode's quarter master
  (outcome-based; watch the monolingual `M.T. Lesson Title` style gap —
  research R3).
- **FR-004 (RE-VERIFY):** per-lesson content footers show each lesson's own
  absolute number; single clean master-page set (no `NN` suffixes, no
  duplicate/orphan page sets); continuous pagination + first-page suppression.
- **FR-005 (RE-VERIFY):** outline start value correct; TOC lists all 13 lessons
  in order.
- **FR-006 (UNCHANGED):** corrupt/missing template still fails the job loudly.

Unit suites (no `soffice`) are unaffected — no Node signatures changed.

## Manual confirmation (SC-005)

Assemble one bilingual and one single-language quarter and compare a lesson
opening + first page against the curriculum owner's manually assembled reference.
If single-language spacing is still tighter and traces to a style the monolingual
template does not define, that is a **template-asset gap** (out of scope here) to
raise with the curriculum owner — not a code fix.

## Rollback

Revert the three flags to `False` and regenerate `module1Xba.ts`. No data or
schema to migrate.
