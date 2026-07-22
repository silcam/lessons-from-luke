# Quickstart: Language Project Archiving and Detail-View Routing

Verify the feature end-to-end in the local web dev environment.

## Prerequisites

```bash
yarn install
yarn migrate:dev        # applies the new addArchivedColumnToLanguages migration
yarn reset:dev          # (optional) reload dev fixtures
yarn dev-web
```

Sign in as the admin (see `secrets.json` `adminEmail` / better-auth).

## Scenario A — Detail-view routing (US3)

1. From the admin Home, open the Languages box and click a language.
   → Browser URL becomes `/languages/<languageId>` (FR-010).
2. Refresh the page.
   → You land back on that same language's detail view, not the bare list
   (FR-011). A brief loading snake may show while languages load (research D6).
3. Press the browser Back button → Languages list. Forward → detail view again
   (FR-012).
4. Copy the URL into a fresh tab (still signed in as admin) → detail view renders
   directly (FR-011).

## Scenario B — Archive with no dependents (US1)

1. Pick a language that no other active language uses as its source language
   (check the source-language pickers), open its detail view.
2. Click **Archive** → a confirmation dialog appears, stating the action cannot be
   undone from within the product (FR-005).
3. Cancel → nothing changes (US1 scenario 2).
4. Archive again and confirm → the language disappears from the Languages list
   (FR-001/003) and you return to the list.
5. Confirm data retention: the row still exists in the DB
   (`psql lessons-from-luke-dev -c "select languageid, name, archived from languages where archived"`)
   and its tStrings/progress/documents are intact (FR-002).

## Scenario C — Archive blocked by dependents (US2)

1. Open a language that at least one active language uses as its source language
   (e.g. English, which most languages depend on).
2. Click **Archive** → blocked; the message names the dependent language(s)
   (FR-008, US2 scenario 1). No confirmation dialog / no state change.
3. Re-point every dependent to a different source language via each dependent's
   Source language picker.
4. Retry Archive on the original language → now proceeds to the confirmation step
   (US2 scenario 2).

## Scenario D — Archived language is invisible / unusable

1. After archiving a language, open the public/translator language-selection list
   → the archived language is absent (FR-003, SC-002).
2. Navigate directly to `/languages/<archivedId>` → redirected to the Languages
   list (FR-013).
3. Navigate directly to `/translate/<archivedCode>` → the Code error screen shows;
   translation is rejected (FR-004). (The code is no longer discoverable in any
   list.)
4. Mid-session guard: with a translate session already open when its language is
   archived, saving a string is rejected (the tString save endpoint's
   `invalidCode` check fails once reads filter archived rows — research D2).
5. Re-point guard: `POST /api/admin/languages/<otherId>` with
   `{"defaultSrcLang": <archivedId>}` is rejected (422) — no active language may
   point at an archived source (research D4, INV-4).

## Non-admin check (FR-014)

Sign in as a non-admin (or signed out): the Archive action is not visible, and
`/languages/:languageId` falls through to the normal home view — never an admin
detail view, never an archived language.

## Known limitation (research D9)

Archival does not propagate to an already-synced **desktop** client until an
unrelated language-creation bumps the sync timestamp or a full resync occurs.
Desktop propagation is an explicit non-goal of this feature.

## Automated verification

```bash
NODE_ENV=test npx jest --runInBand      # unit + integration
yarn test-e2e                           # Cypress web E2E (US1/US2/US3 flows)
yarn typecheck && yarn lint             # strict gates (Principles II/IV)
```

</content>
