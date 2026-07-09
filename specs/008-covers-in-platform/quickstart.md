# Quickstart: Covers in the Platform

End-to-end walkthrough of the cover workflow, mapped to the user stories. Assumes a dev
environment (`yarn dev-web`) with a language that already has a fully translated Table of Contents.

## Prerequisites

- Feature branch `008-covers-in-platform` (stacked off `007-assembled-quarter-download`).
- Real English cover master fixtures created from the maintainer's Drive copy and committed as
  `test/docs/serverDocs/Luke-<series>-97v01.odt` (A4) and `Luke-<series>-98v01.odt` (A3), analogous
  to the existing `Luke-<series>-99v01.odt` TOC fixture.
- A target language with a translated TOC (so shared strings exist to auto-populate).

## US13 — Upload an English cover master

1. Sign in as admin; go to the English document upload page.
2. Drop `English-Luke-Q1-Cover-A4.odt` (or the `T1` variant).
3. **Expect**: the form pre-selects book **Luke**, series **1**, and Cover format **A4**, with a
   visible manual override control (mutually exclusive with the TOC checkbox).
4. Save. **Expect**: the document is stored under reserved lesson number **97**, its title,
   subtitle, copyright line, and publisher address lines are extracted as translatable strings, and
   every list shows it as **"Cover (A4)"** — never "Lesson 97".
5. Repeat with the A3 master → reserved number **98**, shown as **"Cover (A3)"**.

## US14 — Cover text auto-populates from existing translations

1. Open the target language's translation view for the freshly uploaded cover.
2. **Expect**: shared strings (title "Lessons from Luke", subtitle "Teacher's Guide") already show
   the language's existing translations — zero translator action (they reused the existing master
   strings via `addOrFindMasterStrings`, research.md R1).
3. **Expect**: cover-only strings (copyright line, publisher address) appear untranslated and
   editable.
4. Translate the copyright line; save. **Expect**: it persists and remains editable (e.g. changing
   the publication year later is an ordinary string edit).

## US15 — Download a translated cover

1. Go to the target language's language page.
2. **Expect**: the cover appears as a download row labelled **"Cover (A4)"** / **"Cover (A3)"** with
   **Bilingual** and **Single-Language** links (same controls as lessons).
3. Click **Bilingual**. **Expect**: the file downloads as
   `<Language>_Luke-Q1-Cover-A4.odt`, opens with all text fields populated from the language's
   translations (no LibreOffice hand-editing), and shows mother-tongue / majority-language paragraph
   pairs exactly as a bilingual lesson does.
4. Click **Single-Language**. **Expect**: a monolingual `.odt`, as lessons behave.

## US16 — Covers never affect quarter assembly

1. Assemble Luke quarter 1 for a language **before** uploading any covers; note the output and the
   completeness report.
2. Upload and translate the covers, then assemble the same quarter again.
3. **Expect**: the assembled `.odt` is **byte-for-byte identical** to step 1 (no cover content
   merged in), and completeness reporting is unchanged (a quarter with no covers still reports
   complete; covers are never "missing parts").

## Verifying the open technical question (FR-005 / FR-008)

Run the cover ODT integration test (research.md R2):

```bash
npx jest src/server/xml/<cover>.integration.test.ts --runInBand
```

It parses a real cover master fixture and asserts the `motherTongue` / majority-language
classification of each extracted string (especially the bare `Copyright_20_text` and
`Book_20_number` styles and the address paragraphs), then round-trips through `makeLessonFile` in
both modes. A failure here means the bilingual pairing rule or a style classification needs a small
adjustment in `parse.ts` — resolve before wiring the download UI.

## Key test commands

```bash
npx jest src/core/models/Lesson.test.ts --runInBand            # cover naming + isCoverLesson
npx jest src/server/xml/parse.test.ts --runInBand              # new style extraction
npx jest src/server/controllers/assemblyController.test.ts --runInBand  # FR-012 constituent filter
npx jest src/frontend/web/lessons/UploadLessonForm.test.tsx --runInBand # filename detection (Q/T, A4/A3)
```
