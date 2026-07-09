---
date: 2026-07-09
topic: covers-in-platform
---

# Covers in the Platform (Workstream 3, SOP §30.2)

## Problem Frame

Quarter covers are the last hand-edited text artifact in the publishing workflow.
Today (SOP §22) the operator copies an English cover `.odt` from Google Drive, renames
it per language/book/quarter/format, and hand-edits every text field in LibreOffice —
title, subtitle, copyright, publisher address — even though most of that text already
exists as translated strings in the platform. There are two formats per quarter
(A4 cut-sheet and A3 full-spread booklet), so this is 8 hand-edited documents per
book per language.

This workstream brings covers into the platform the way the TOC was brought in
(reserved lesson number 99), so cover text populates from existing translations and
covers download translated from the language page, ready for the manual PDF export
and print handoff.

**Verified against the real English cover masters**
(`~/Downloads/lessons-from-luke/Luke bilingual editable files/Covers/`, 2026-07-09):

- Covers exist per (book, series, format): 4 quarters × 2 formats. Quarter identity
  lives in the artwork and filename — there is **no quarter number as text** in the
  documents.
- Translatable text is small: title ("Lessons from Luke"), subtitle ("Teacher's
  Guide" + a mother-tongue pair line), copyright placeholder ("© Year of Publication
  Publisher"), and publisher address lines.
- The masters use style names `M.T._20_-_20_Cover_20_Title` / `..._subtitle` (hyphen
  variant), `Copyright_20_text`, `Book_20_number`, `Table_20_Contents` — **not** the
  `M.T._20_Cover_20_title` variants `parse.ts` currently recognizes; a small
  known-styles extension is required.
- Bilingual structure (M.T. + majority-language paragraph pairs) matches lessons, so
  the existing `makeLessonFile` merge semantics apply.

## Requirements

**Modeling & upload**

- R1. Covers **MUST** be modeled as reserved lesson numbers within each
  (book, series) — one number per format (proposed: 97 = A4, 98 = A3; finalize in
  specify) — following the TOC=99 precedent. No new document-kind entity, no schema
  migration, no `Persistence` interface change.
- R2. English cover masters **MUST** be uploadable through the existing
  English-document upload path. The upload form **MUST** recognize cover files by
  naming convention (e.g. `English-Luke-Q1-Cover-A3.odt`,
  `English-Luke-T1-Cover-A4.odt` — note the real files inconsistently use `T` vs `Q`
  for series) and pre-select cover format and series, with a manual override control
  (as the TOC checkbox does today).
- R3. Uploading a cover master **MUST** extract all translatable cover text (title,
  subtitle, copyright line, publisher address lines) as lesson strings, which
  requires recognizing the cover masters' actual style names (see Problem Frame).

**Translation & auto-population**

- R4. Where a cover's English text matches an existing master string (e.g. the title
  and "Teacher's Guide" already translated via TOC/front matter), existing
  translations **MUST** apply automatically via the existing TString master-ID
  dedup — no new mapping mechanism. Cover-only strings (copyright, publisher
  address) are translated once per language in the normal translation UI and remain
  editable (year/publisher changes are ordinary string edits).
- R5. Both bilingual (`majorityLanguageId=<ref>`) and monolingual
  (`majorityLanguageId=0`) cover output **MUST** be supported, reusing
  `makeLessonFile` semantics unchanged.

**Download & display**

- R6. Translated covers **MUST** be downloadable per (language, book, quarter,
  format) from the language page, with output filenames following the SOP §11
  convention (e.g. `<Language>_Luke-Q1-Cover-A4.odt`).
- R7. Covers **MUST** display with human-readable names (e.g. "Cover (A4)"), never
  as "Lesson 97/98", in lists, download links, and filenames.

**Isolation**

- R8. Covers **MUST NOT** affect quarter completeness (`isQuarterComplete` /
  `missingQuarterParts`) or the assembled-quarter output; a quarter with no covers
  assembles exactly as today, and covers are never merged into the assembled `.odt`
  (covers are color and printed separately — SOP §22.1).
- R9. Domain data access **MUST** go through the `Persistence` interface; because
  covers are just lessons with reserved numbers, no storage-implementation changes
  are expected across PG/test/dev/LocalStorage.

## Success Criteria

- An operator can produce translated A4 and A3 cover `.odt`s for a language and
  quarter from the platform without hand-editing any text in LibreOffice —
  SOP §22.2–§22.4 (copy, rename, hand-edit) become obsolete; §22.5 (PDF export)
  stays manual.
- Uploading the 8 English Luke cover masters requires no per-file manual metadata
  entry beyond confirming the auto-detected book/series/format.
- For a language with a fully translated TOC, a freshly uploaded cover shows its
  shared strings (title, subtitle) already translated.
- Quarter assembly behavior (007) is byte-for-byte unaffected by the presence or
  absence of covers.

## Scope Boundaries

- No PDF export of covers (stays manual per SOP §22.5; a later phase can add
  `--convert-to pdf` alongside WS-2c).
- No bundling of covers into the assembled quarter `.odt`.
- No A3 imposition or PDF compression automation.
- No auto-populated quarter-number text — it does not exist as text in the masters;
  quarter identity stays in the per-quarter artwork.
- No metadata-driven field mapping (publication year, publisher registry, etc.);
  those fields are ordinary translatable strings.
- No desktop (Electron) special-casing; covers flow through the generic lesson
  pipeline, whatever the desktop already does with lessons applies unchanged.

## Key Decisions

- **Reserved lesson numbers, not a document-kind entity**: TOC=99 precedent; zero
  schema/`Persistence` change across four storage implementations; constitution
  Principle VII (KISS).
- **Both formats in the platform, as two documents**: A4 and A3 each get a reserved
  number per series; heavy string overlap means translating one mostly fills the
  other. A4-only would leave §22 half-automated.
- **Auto-population = TString content dedup**: no explicit field-mapping layer; the
  sample masters contain only ~6 short strings, so a mapping mechanism has no
  payoff.
- **Fully separate from quarter assembly**: covers never gate or join the assembled
  interior; matches the print shop's color/B&W split.

## Dependencies / Assumptions

- Builds on the 007-assembled-quarter-download branch (complete/hardened); the new
  feature branch stacks off 007 per the repo's stacked-PR convention.
- English cover masters (8 files for Luke) come from the maintainer's Drive copy;
  test fixtures analogous to `Luke-<series>-99v01.odt` will be needed.
- Assumes TString dedup links identical English text across documents to the same
  master string (R4 relies on this — verify early in planning).

## Outstanding Questions

### Resolve Before Specify

- (none)

### Deferred to Planning

- [Affects R4][Needs research] Verify that uploading a document whose English text
  matches an existing master string reuses that master ID (and hence its
  translations) rather than minting a new string; if it does not, R4 needs a
  dedup-on-upload adjustment, not a mapping layer.
- [Affects R3][Technical] Exact `parse.ts` known-style additions
  (`M.T._20_-_20_Cover_20_Title`/`subtitle`, `Copyright_20_text`, `Book_20_number`)
  and whether non-M.T. copyright/address paragraphs extract as majority-language
  strings correctly under the existing bilingual pairing rules.
- [Affects R1/R8][Technical] Confirm `Quarter.ts` completeness logic ignores extra
  lesson numbers 97/98 without modification, or add an explicit exclusion; confirm
  `documentName`/`lessonName` special-casing covers R7.
- [Affects R2][Technical] Upload filename-recognition regex handling the `T` vs `Q`
  series-prefix inconsistency in the real master filenames.

## Next Steps

→ `/sp:02-specify` covers-in-platform (Workstream 3), referencing this document;
create the feature branch stacked off `007-assembled-quarter-download`.
