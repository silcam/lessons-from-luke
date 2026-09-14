# Addendum: single clean page-style set (chapterized footers)

**Date:** 2026-07-10
**Supersedes:** the per-constituent page-style renaming design (`renameMasterPageStyles`) and the pre-merge footer literal flattening (`flattenFooterFields`), both described in `research.md` §R4 and `data-model.md` ("flattened footer" rows).

## Problem

The client reported that assembled quarter books carried every page style
14×, suffixed per constituent ("Coloring Page 00" … "Coloring Page 13").
LibreOffice template application maps styles **by name**, so his standard
quarter styles template could not be applied to the assembled document. The
suffixing was our own `renameMasterPageStyles`, added because
`insertDocumentFromURL` dedupes master pages by display name (first
definition wins) and per-lesson footers then depended on the styles staying
distinct — `flattenFooterFields` baked literal per-lesson Quarter/Lesson
numbers into each constituent's footers.

## Decision

Match the client's own hand-assembled quarter masters
(`test/docs/references/English_Luke-Q2-Master-bilingual.odt`), which resolve
per-lesson footer values **positionally** from one shared page-style set:

- **`prepareConstituentForAssembly`** (replaces both removed modules, one
  zip round-trip per constituent):
  - footer `text:user-defined[Lesson]` fields → live
    `text:chapter text:display="number" text:outline-level="1"` fields;
  - `text:user-defined[Quarter]`, `text:title`, `text:subject` stay **live**
    (book-level values, one per quarter);
  - **no page-style renaming** — all 14 sets become identical, so the
    display-name dedupe collapses them into one clean set;
  - lessons must carry exactly one level-1 outline heading: newer masters
    already do (hidden heading paragraph); legacy masters (v03-era) get a
    hidden self-styled heading injected after `text:sequence-decls`
    (title from `dc:subject`, fallback domain lesson name);
  - validation counts **effective outline participants** (`text:h` plus
    `text:p` whose style chain inherits `style:default-outline-level="1"`) —
    spike-verified that LibreOffice counts both toward chapter numbering, and
    a stray participant shifts every later lesson's footer off by one.
    Lessons must have exactly 1, the TOC exactly 0.
- **`finalizeAssembledQuarter`** (post-merge, new step in
  `assembleQuarter`): patches the merged book's level-1 outline style
  (`style:num-format="1"`, `loext:num-list-format="%1%"`,
  `text:start-value=(series-1)*13+1`, e.g. 14 for series 2 — the blank merge
  base's empty num-format would render chapter-number fields blank) and
  writes the book metadata the live fields resolve against (`Quarter`
  custom property = series, `dc:title`/`dc:subject` from the TOC
  constituent, SOP §16.2).

## Deviation from the original fix plan

The plan called for chapterizing `text:subject` footer fields too. Evidence
said otherwise: the only `text:subject` footer field lives in the
Front-matter footer, and the client's reference keeps it **live** — his
front-matter pages show the book-level "Teacher's Guide" subject, not a
per-lesson title (per-lesson titles in content footers already use a native
`text:chapter text:display="name"` field in the source masters). So
`text:subject`/`text:title` are left untouched and resolve via the
finalization metadata patch.

## The `.ODM` question

Switching (back) to a master document was re-examined and rejected — see
`spike/odm/FINDINGS-odm.md`: no pagination benefit, and it reintroduces the
protected/linked sections FR-002 exists to eliminate. Its one useful lesson
(live chapter-field footers) is exactly what this design adopts inside the
existing `insertDocumentFromURL` merge.

## Spike evidence (2026-07-10, hand-transformed series-2 masters)

- merged output has exactly ONE master page per display name, none suffixed;
- rendered footers show Quarter 2 / Lessons 14–26 per lesson, TOC pages
  clean, front matter shows "Teacher's Guide – Quarter 2";
- post-merge outline patch honored on reopen/render (no macro change
  needed);
- injected hidden heading: invisible in the rendered PDF, pagination
  unshifted, downstream chapter numbers correct;
- pagination parity preserved (continuous numbering, first-page
  suppression, the known +1 offset — FR-003).
