# Contracts: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population
**Framing**: Two-mechanism model (2026-07-14 spec amendment).

This feature introduces **no new HTTP endpoints**. Per constitution VII (YAGNI /
simplicity), all behavior rides existing surfaces and existing manually-run
server scripts.

## Existing endpoints whose behavior changes (no signature change)

| Endpoint                    | Handler / action                       | Behavior change                                                                                                                   |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/admin/documents` | `uploadEnglishDoc` → `parseDocStrings` | Mechanism 2: the pre-parse splitter runs over the persisted master so residual **unsplit** references become book + numeric runs. |
| `POST /api/admin/languages` | `defaultTranslations`                  | Mechanism 1: numeric-reference masters are now auto-translatable, so a new project pre-fills them verbatim from English (FR-001). |

Request/response shapes are unchanged; there is nothing new to specify as an
OpenAPI contract.

**Update-path re-population (red-team Pass 1, HIGH).** Broadening the shared
`canAutoTranslate` predicate causes `findTSubs.usefulEngSub` to **suppress**
update-issues whose changed English "from" strings are all numeric references. A
master **revision** that corrects a numeric reference (e.g. `1:5–25` → `1:5–24`)
therefore no longer surfaces to translators, and `POST /api/admin/documents`
(`uploadEnglishDoc` → `saveDocStrings`) does **not** re-apply auto-translation on
update — so the changed numeric master would be silently blank in existing
projects until a manual backfill runs. To preserve FR-010's intent, the update
path (upload + re-processing task) MUST re-carry **changed** auto-translatable
numeric masters into existing projects (fill-only, never overwrite; `defaultTranslateAll`
skip semantics), or the manual-backfill-after-every-revision requirement MUST be
documented as a standing operational invariant. See plan.md § Edge Cases & Error
Handling.

## Manually-run server scripts (not HTTP; extend existing precedents)

These are operator-run Node scripts under `src/server/tasks/`, mirroring the
existing `reparseEnglish.ts` / `defaultTranslateAll.ts` pattern — **not** API
routes.

| Script (extends / mirrors)            | Purpose                                                                                 | Requirement            |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| Re-processing task (`reparseEnglish`) | Run the splitter over every stored master + drive the version-bump / update-issue flow. | FR-012, FR-015         |
| Backfill (`defaultTranslateAll`)      | Fill existing projects' missing numeric references; skip any string already translated. | FR-011, FR-013, SC-005 |

**Operational sequence (FR-013)**: run the re-processing task **first**, then the
backfill.

## Why no OpenAPI/GraphQL schema is emitted

The spec is backend/server-only (spec Assumptions: web/server only; auto-
population rides the existing core auto-translate path that desktop inherits).
No new request/response contract exists to formalize; inventing endpoints here
would violate constitution VII. The honest contract artifact is this README.
</content>
