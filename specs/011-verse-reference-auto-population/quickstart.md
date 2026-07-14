# Quickstart: Auto-Populate Verse-Reference Strings

**Feature**: 011-verse-reference-auto-population

## What this feature does

Isolated verse references in English masters (the TOC "Story" column and each
lesson's title scripture reference) are split at upload into two translatable
strings: a **book name** (`Luke`) and a **language-neutral numeric reference**
(`1:5–25`). Numeric references auto-populate verbatim when a new language project
is created; the book name is translated once and propagates everywhere via
master-string deduplication. Prose that merely contains a reference is never
touched.

## Developer walkthrough

### New-project pre-fill (US1, US2 — primary path)

1. Upload an English master via `POST /api/admin/documents`. Isolated-reference
   paragraphs are normalized into book + numeric spans; prose is left intact.
2. Create a language via `POST /api/admin/languages`. Every numeric reference
   string is auto-populated from English; book-name strings remain empty.
3. Translate the book name (`Luke`) once → every reference in that language shows
   the translated book name + the pre-filled numeric part.

### Verify the shape detector against the corpus (SC-003)

The committed `test/docs/serverDocs/` masters cover Luke Q1–Q4. Unit-test
`parseVerseReferences` against the extracted reference + prose fixture: 95
standalone references parse to non-null segments, 0 of the 160 colon-bearing
prose strings parse to non-null.

### Verify round-trip identity (US3, SC-004)

Run the round-trip `*.integration.test.ts` with the sandbox disabled (soffice
hangs in-sandbox; jest needs localhost Postgres):

```bash
yarn test:integration   # normalize → merge → soffice → assert visual identity
```

## Operator post-deploy sequence (US4 — run in this order, FR-012)

```bash
# 1. Re-normalize all stored English masters (splits references, routes changes
#    through the lesson-update-issues flow).
node dist/server/server/tasks/renormalizeEnglish.js

# 2. Backfill: give existing projects the missing numeric reference strings.
#    Skips anything already translated; never overwrites translator work.
node dist/server/server/tasks/defaultTranslateAll.js
```

After step 1, translators opening an affected project see the change through the
existing lesson-update-issues screen, with their prior combined-reference
translation shown as the "from" side to carry over.

Both tasks are idempotent — re-running either produces no duplicate strings and
destroys no work.

## Key files

- `src/core/util/verseReference.ts` — `parseVerseReferences` (shape detector).
- `src/server/xml/normalizeReferences.ts` — odt content.xml span rewrite.
- `src/server/actions/defaultTranslations.ts` — unified `canAutoTranslate`
  (colon added), auto-population on project create.
- `src/server/tasks/renormalizeEnglish.ts` — one-time re-normalization task.
- `src/server/tasks/defaultTranslateAll.ts` — backfill (imports unified
  predicate).
