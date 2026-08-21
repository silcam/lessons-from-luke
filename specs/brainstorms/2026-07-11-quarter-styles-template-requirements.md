---
date: 2026-07-11
topic: quarter-styles-template
---

# Automated Quarter-Styles Template Application (WS-2c)

## Problem Frame

The assembled quarter download (007 / WS-2b) delivers an editable `.odt`, but it
still carries the working styles from the source masters — most visibly the
yellow `M.T.*` mother-tongue highlight. To make the book print-ready, the
operator (Chris) applies his standard quarter styles template by hand
(LibreOffice Format → Styles → Load Styles). His first attempt against our
assembled output failed because every page style appeared 14×, suffixed per
constituent; that wall is now removed (the 2b chapterized-footers fix ships one
clean, un-suffixed page-style set), so manual application works again — WS-2c
automates it so every assembled quarter comes out already styled.

Provenance note: the "quarter styles template" is not in the SOP or the April
interview — both describe only the hand edit that removes the `M.T.` background
color (SOP §16/§881–885). The template file exists per Chris's report on the 2b
sample (captured in `specs/007-assembled-quarter-download/addendum-page-styles.md`),
but we do not yet hold the file and its full contents are unconfirmed.

## Requirements

**Behavior**

- R1. Every assembled quarter `.odt` MUST have the quarter styles template
  applied during assembly (always-on; no user-facing toggle). The template-styled
  book is the one canonical output per (language, book, series, output-type).
- R2. With the current stand-in template, the output's `M.T.*` paragraph-style
  family MUST carry no background highlight (the print-readiness effect the
  template exists to deliver, per SOP §16).
- R3. Template application MUST NOT regress the 2b invariants: single clean
  un-suffixed page-style set, per-lesson chapterized footers, continuous
  pagination with first-page suppression, full editability (no protected or
  linked sections), and the book metadata written by finalization.
- R4. If the template step fails (asset missing, unreadable, or the style-load
  errors), the assembly job MUST fail with the error surfaced to the caller.
  No unstyled book is ever delivered as if print-ready ("partial books are
  worse than errors", 007 FR lineage R5).

**Template asset**

- R5. The template is a swappable application asset: replacing the file swaps
  the styles with no code change. One global template applies to all languages,
  books, and series.
- R6. Until Chris's real template file arrives, the stand-in is a style source
  derived from his hand-assembled reference
  (`test/docs/references/English_Luke-Q2-Master-bilingual.odt`); it is
  shippable, and the real file replaces it as a drop-in.

**Quality gates (constitutional)**

- R7. `soffice`-touching behavior is covered by `*.integration.test.ts`; unit
  tests MUST NOT require `soffice`.

## Success Criteria

- Chris no longer performs the manual Load Styles / highlight-off step: the
  downloaded quarter book opens print-styled, and his visual-QA pass (SOP
  §30.8) happens on that styled, still-editable document.
- Rendered output parity with 2b on pagination, footers, and editability
  (existing integration checks keep passing).
- Swapping the template asset for Chris's real file requires no code change.

## Scope Boundaries

- No UI changes: no working-vs-print-ready toggle, no template upload or admin
  management screen. The asset ships with the app.
- No per-language / per-book / RTL template variants (cheap to add later if
  ever needed — style loading accepts any document URL).
- PDF export remains out of scope (WS-2d: won't do).
- Per-lesson download endpoints and the translation interface untouched.

## Key Decisions

- **Always-on application**: one canonical output beats a variant matrix; QA
  happens on the print-styled book. (User decision 2026-07-11.)
- **Fail the job on template failure**: the template is a build-time asset, so
  absence is a deployment bug, not a runtime condition to paper over.
- **Ship with the stand-in derived from the Q2 reference master**: unblocks the
  feature; requesting the real template from Chris (alongside 2b sample
  sign-off) is a long-lead, non-blocking item.
- **Deliverable is template-file application, not just highlight-off**: builds
  the durable mechanism; R2 pins the minimum observable effect so the stand-in
  is verifiable.

## Dependencies / Assumptions

- 2b page-styles fix (single clean page-style set) — landed on
  `007-assembled-quarter-download` (`34f53a9`); WS-2c builds on it.
- Technical direction per roadmap (inherently technical here): one
  `StyleFamilies.loadStylesFromURL(templateUrl, {OverwriteStyles, …})` call in
  the existing assembly macro between the last insert and `storeToURL` — no new
  process.
- Assumption: Chris's real template maps styles by name onto the same style
  families the masters use (his report confirms name-based mapping is how he
  applies it).

## Outstanding Questions

### Resolve Before Specify

- (none)

### Deferred to Planning

- [Affects R2/R6][Technical] Stand-in form: point `loadStylesFromURL` at the Q2
  reference master directly vs. extract a cleaned template document from it.
- [Affects R3][Technical] Which style-family load flags to pass
  (Overwrite / Para / Char / Frame / Page / Numbering) so template styles win
  without clobbering the chapterized-footer page-style set.
- [Affects R3][Needs research] Verify style loading is orthogonal to the
  doc-level outline-numbering patch and metadata written by
  `finalizeAssembledQuarter` (roadmap flags this for spike verification), and
  that pagination parity holds after template application.
- [Affects R4][Technical] Where the template asset lives in the deployed tree
  and how its presence is validated at startup vs. per-job.

## Next Steps

→ `/sp:02-specify` to create the formal specification (decide there whether
this extends the 007 feature branch or opens a new `008-*` feature).
→ Non-blocking: request the real quarter styles template file from Chris with
the 2b sample sign-off.
