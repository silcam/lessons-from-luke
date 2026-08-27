# Before you edit the quarter-styles templates

The two `.odt` files in this folder are the **style masters for every
assembled quarter book**:

- `quarter-styles-template.odt` — bilingual books (majority language + mother tongue)
- `quarter-styles-template-monolingual.odt` — single-language books

When the server assembles a quarter, LibreOffice loads **all** styles, page
layouts, headers, and footers from the matching template file, overwriting
whatever the individual lesson documents carried. That makes these files very
powerful — and it means a small, well-intentioned edit in LibreOffice can
silently break page numbering, footers, or the table of contents for every
book the server produces afterward.

This page lists the rules a template must keep, how each one is checked, and
the safe procedure for swapping in an edited template.

> **A note on style names.** LibreOffice shows style names with spaces
> ("Lesson title - invisible"); inside the file they are stored with `_20_`
> in place of each space (`Lesson_20_title_20_-_20_invisible`). The rules
> below use the LibreOffice spelling.

## Rules the templates must keep

Each rule below is enforced by an automated test that opens the real files in
this folder, so breaking one fails the build (`yarn test:once`) rather than
shipping a broken book.

1. **No page-number offsets anywhere.** No page-number field may carry a
   "page adjustment" / offset (in the file: `text:page-adjust`). Offsets were
   the root cause of a 2026-08 wrong-page-numbers defect. If numbering looks
   off, fix the page styles, not the field.
   _Checked by `src/server/assembly/quarterStylesTemplate.test.ts`._

2. **The invisible lesson-title styles must stay outline level 1.** Every
   paragraph style named like "Lesson title - invisible" (including the
   "M.T." variant) must keep **Outline level: Level 1** (Organizer tab of the
   style dialog). The footer's lesson number is a live Chapter field that
   resolves against level-1 headings; a template whose copy of the style
   drops the outline level demotes every hidden lesson title to a plain
   paragraph, all footers lose their lesson numbers, and assembly fails with
   _"assembly failed to measure lesson 1's opening page"_ (the 2026-08 Kwasio
   defect). A template may omit a family entirely; it must never define one
   without the outline level.
   _Checked by `quarterStylesTemplate.test.ts`._

3. **These two page styles must exist, with these exact names:**
   **"First Page"** and **"Front matter"**. The assembly code refers to both
   by name (each lesson's opening page is pinned to "First Page"; the
   front-matter section's breaks key off "Front matter"). Renaming or
   deleting either produces silently wrong pagination.
   _Checked by `quarterStylesTemplate.test.ts`._

4. **The "Lesson Content" page's footer must keep its live fields.** The
   lesson number is a **Chapter field** and the quarter number is a
   **user-defined "Quarter" field**. Never retype either as plain text —
   the book would show one lesson/quarter number on every page.
   _Checked by `quarterStylesTemplate.test.ts`._

5. **No new English words in any footer.** The footers' English text
   ("Quarter", "Lesson", "Page", "Teacher's Guide", "Lessons from Luke") is
   translated by the server after assembly, from a fixed vocabulary list. A
   footer edit that introduces a new English word ships untranslated in
   every non-English book unless the word is also added to
   `QUARTER_FOOTER_LITERALS` in `src/server/assembly/footerVocabulary.ts`
   (with translations).
   _Checked by `src/server/assembly/footerVocabulary.test.ts`._

6. **The monolingual template must define the plain (non-M.T.) styles.**
   Monolingual assembly rewrites the "M.T." paragraph styles to their plain
   equivalents — "Lesson Title", "Lesson title - invisible",
   "Coloring Page - Memory Verse", "Coloring Page - Truth" — which only this
   template defines. Deleting or renaming any of them fails every
   monolingual assembly (source list:
   `src/server/xml/monolingualRestyle.ts`).
   _Checked by `quarterStylesTemplate.test.ts`._

## One more coupling to know about

During assembly the server renders the book to PDF and **reads the English
footer text** ("Quarter 3 Lesson 27", "Page 5") to tell page types apart and
verify pagination — footers are translated only after that measurement. So a
footer **wording or layout** change (even one that passes every test above)
can make a job fail with the somewhat misleading error
_"assembly failed to measure lesson 1's opening page."_ If that error appears
right after a template swap, suspect the footer edit first. The logic lives
in `src/server/actions/pdfRenderOptions.ts` and
`src/server/actions/measureLessonOneParity.ts`.

## Swapping in an edited template

Do **not** just copy the file in and deploy. From the project root:

1. Replace the file, keeping the exact filename:
   `assets/quarter-styles-template.odt` or
   `assets/quarter-styles-template-monolingual.odt`.
2. `yarn test:once` — the unit suite opens the new file and checks every
   rule above. Fix any failure before going further.
3. `yarn test:integration` — assembles a real book with LibreOffice and
   verifies page counts, footers, and the table of contents end to end
   (requires `soffice`, `pdftotext`, and `pdfinfo` on PATH).
4. Only then commit and deploy.

## Why these rules exist

The full design record for pagination and assembly — including the history
behind the page-adjust ban and the outline-level requirement — is
`specs/017-quarter-pagination-fixes/contracts/pagination-and-assembly.md`
(§1 template assets, §3 measurement). Related: specs 007, 009, 013.
