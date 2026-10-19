---
date: 2026-08-04
topic: rtl-language-support
---

# RTL Language Support (Arabic and other right-to-left scripts)

## Problem Frame

Translation teams working in right-to-left scripts (Arabic tested; Hebrew, Farsi, Urdu
plausible later) can already enter and save translations — bidi text reorders correctly
at the word level. But the product treats every language as left-to-right:

- **Generated ODT documents** (the actual deliverable handed to teachers and children)
  render Arabic in left-to-right paragraph frames: left-aligned headings and table
  cells, trailing punctuation stranded on the wrong side, list markers on the left,
  no complex-script (CTL) font/language properties (text is tagged `en-GB`), and
  fonts chosen by fallback rather than design.
- **The web translation UI** edits and previews RTL text in LTR containers.
- **The Language model** has no direction/script metadata, so nothing downstream can
  even know a language is RTL.

An RTL document that isn't mirrored reads as foreign and unprofessional to a native
reader. The current effort is exploratory: map everything required and tier it so we
know the cost of "minimum credible" vs "fully native" before committing.

## Requirements

**Language model & designation**

- R1. A language can be designated right-to-left via an explicit admin-set toggle
  ("right-to-left script") when creating or editing the language. This is a new
  persisted attribute (migration required).
- R2. The RTL designation is available server-side to the document pipeline and to the
  frontend for content rendering. Existing languages default to LTR; no behavior
  changes for them.

**Document generation — paragraph-level RTL (Phase 1)**

- R3. In generated lesson documents for an RTL mother tongue, every mother-tongue
  paragraph renders with RTL base direction: right-aligned by default, trailing
  punctuation and short final lines on the right, list/bullet markers on the right.
- R4. Mother-tongue text in RTL documents carries proper complex-script (CTL)
  properties: an appropriate Arabic-capable font, CTL font size, and correct language
  tagging (no more hardcoded `en-GB` on translated lines). Font choice is a planning
  research question (see Deferred).
- R5. English lines in bilingual documents are unaffected — they keep their current
  LTR styling.
- R6. The raw English master documents (admin uploads) are never modified; RTL
  treatment applies only to generated output for RTL languages.

**Document generation — structural mirroring, monolingual (Phase 2)**

- R7. Monolingual RTL documents fully mirror: table layouts flip so label columns sit
  on the right, list markers and indentation mirror, and page layout
  (margins/headers/footers, lesson-number badge placement) is RTL.
- R8. Structural-mirroring details are steered by native-reader feedback on Phase 1
  output (see R14) rather than fixed up front.

**Bilingual documents**

- R9. Bilingual (RTL mother tongue + LTR majority language) documents get text-direction
  treatment only (R3–R5): RTL paragraphs render natively, but overall page and table
  layout stays LTR. No structural mirroring for bilingual output.

**Quarter assembly & covers**

- R10. RTL treatment (per the tiers above) applies uniformly across all generated
  outputs: single-lesson downloads, assembled quarters, and covers — bilingual and
  monolingual modes alike.

**Web application (Phase 3)**

- R11. The frontend adopts an RTL-ready foundation: direction-aware content rendering
  built on logical layout primitives, so full mirroring can activate later without a
  rewrite.
- R12. Content areas activate now: translation input fields edit RTL text correctly
  (right-aligned, sane cursor/selection behavior) and the lesson preview displays RTL
  content with correct direction.
- R13. App chrome (nav, buttons, labels — currently English-only) does not mirror in
  this effort; chrome mirroring is tied to a future UI-localization effort.

**Validation**

- R14. Sample RTL output (lesson, quarter, cover) is reviewed by a native Arabic
  reader before the document work is called done; their feedback gates and steers
  Phase 2 details.
- R15. Document mechanics (direction, alignment, CTL attributes surviving the
  pipeline) are covered by automated verification consistent with the constitution's
  multi-layer document-processing standard.

### Behavior by output mode

| Output                           | Direction of MT text | Tables/page layout                  | Phase |
| -------------------------------- | -------------------- | ----------------------------------- | ----- |
| Bilingual lesson/quarter/cover   | RTL (R3–R5)          | LTR (unchanged)                     | 1     |
| Monolingual lesson/quarter/cover | RTL (R3–R5)          | Fully mirrored (R7)                 | 2     |
| Web translation inputs/preview   | RTL (R12)            | Content-area only; chrome LTR (R13) | 3     |

## Success Criteria

- A native Arabic reader reviews the monolingual output and confirms it reads as a
  properly typeset Arabic document (not "English layout with Arabic words").
- Bilingual output: every Arabic line reads with correct base direction and
  punctuation placement; English lines unchanged.
- Existing LTR languages produce byte-identical (or behaviorally identical) output —
  no regression to the ~all-LTR install base.
- An admin can onboard a new RTL language with a single checkbox; no engineering
  involvement per language.

## Scope Boundaries

- No app-chrome mirroring and no UI localization into Arabic (future effort, R13).
- No structural mirroring of bilingual documents (R9).
- No automatic direction detection from content — designation is explicit (R1).
- No BCP-47/locale-code overhaul of the language `code` field; the RTL flag is a
  single-purpose attribute.
- No Nastaliq or per-language font customization for Farsi/Urdu until such a project
  exists; one good default for Arabic script suffices now.
- No changes to translation entry/storage — bidi text content already round-trips
  correctly.
- Desktop (Electron) app parity follows the shared frontend components but is not a
  separately validated target this round.

## Key Decisions

- **ODT documents first**: the printed document is the end product; web UI follows.
- **Explicit admin RTL flag** over auto-detection (unpredictable on mixed content) and
  over locale codes (disproportionate carrying cost).
- **Bilingual = text-direction only**: the bilingual doc is mixed-direction by nature
  and serves partly as a translation-checking aid; full mirror there would degrade the
  English half.
- **Monolingual = full mirror**: the native reader is the sole audience; a
  left-handed table reads as wrong immediately.
- **RTL-ready foundation, not full app mirror**: chrome is English; mirroring English
  chrome feels odd. Build so mirroring can switch on when the UI is localized.
- **Phased features, one requirements doc**: (1) RTL flag + paragraph-level RTL
  documents, (2) monolingual structural mirroring, (3) web RTL-ready foundation.
  Each ships independently; native-reader feedback between phases steers the next.
- **Native-reader review as the quality gate**: automated checks verify mechanics,
  not nativeness.

## Dependencies / Assumptions

- Arabic is the reference RTL script for design and validation; a native Arabic
  reader is available for review (R14).
- The English master templates' existing style discipline (distinct mother-tongue
  paragraph styles; logical start/end alignment) holds across all masters in
  production, not just the ones inspected. Planning should verify a sample.
- Generated documents must render correctly in LibreOffice (the supported tool);
  fidelity in Word or other consumers is not a requirement.

## Outstanding Questions

### Resolve Before Specify

(none — phase decisions above are sufficient to specify Phase 1)

### Deferred to Planning

- [Affects R4][Needs research] Which Arabic-capable font (e.g. Noto Naskh Arabic,
  Scheherazade New, Amiri) — evaluated for print legibility for children, licensing,
  availability on the production server's LibreOffice, and whether fonts must be
  embedded in the ODT for portability. Includes the CTL size ratio vs Latin text.
- [Affects R3, R10][Technical] Where the RTL restyling pass hooks into the generation
  and assembly pipelines so single lessons, assembled quarters, and covers all
  inherit it exactly once, without touching raw masters (R6).
- [Affects R7][Technical] The precise ODT mechanics of table/page mirroring
  (writing-mode on table, cell, and page-layout styles) and how they survive quarter
  assembly's style merging.
- [Affects R7][User decision, informed by R14] Whether numbered lists in monolingual
  Arabic output should use Arabic-Indic digits (٠١٢…) or Western digits — take the
  native reader's/translation team's preference.
- [Affects R12][Technical] Whether translation fields use per-language direction
  (from the R1 flag) or `dir="auto"` per field; mixed-content fields (references
  like "Luke 1:13" at line start) may need isolation.
- [Affects R15][Technical] How automated verification asserts direction/CTL
  attributes post-round-trip (LibreOffice re-save) for the three output kinds.

## Next Steps

-> `/sp:02-specify` Phase 1: RTL language flag + paragraph-level RTL document
generation (R1–R6, R9, R10 at the paragraph tier, R14–R15), referencing this doc:
`specs/brainstorms/2026-08-04-rtl-language-support-requirements.md`
