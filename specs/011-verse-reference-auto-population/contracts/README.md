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
