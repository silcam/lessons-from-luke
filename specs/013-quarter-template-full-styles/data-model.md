# Data Model: Quarter Template Full Style-Family Application (013)

**No persistent data model changes.** No new tables, columns, migrations, or
`Persistence` entities. No new in-memory types or function signatures. This
feature changes one configuration inside the existing assembly macro (the set of
style families loaded) and re-verifies existing behavior.

The relevant "entities" are all existing documents and one configuration value.

## Entities (all existing)

### Quarter styles template (asset, existing)

- Two committed static assets, keyed by assembly mode:
  - `assets/quarter-styles-template.odt` — bilingual mode.
  - `assets/quarter-styles-template-monolingual.odt` — single-language mode
    (majority-translation language id `0`).
- Verified current against the curriculum owner's 2026-07-23 masters; **not
  regenerated** in this feature (scope boundary).
- Relevant style definitions confirmed by static inspection (research R2–R4):
  - `First Page` master page: **no footer** (both assets).
  - `Lesson Content` master page footer: live `text:chapter`,
    `text:user-defined[Quarter]`, `text:page-number` fields (both assets).
  - Lesson-opening spacing lives in **paragraph** styles (e.g. `Lesson Title`,
    `M.T. Lesson Title`); frame/graphic styles and page-layout margins are
    identical to the constituent's.
  - **Style-set gap (single-language):** a 2026-07-23 style-name diff of both
    committed assets confirms the monolingual template omits exactly five
    `M.T.`-prefixed paragraph styles present in the bilingual template:
    `M.T. Lesson Title`, `M.T. Lesson title - invisible`,
    `M.T. Coloring Page - Memory Verse`, `M.T. Coloring Page - Truth`, and
    `M.T. Example text`. Every other `M.T.`-prefixed style (application, Bible
    story, front matter, text variants, etc.) is defined in both assets — the
    gap is scoped to lesson-opening/coloring-page styles, not `M.T.` styles
    generally (see research R3 caveat).

### Constituent lesson document (existing)

- Per-lesson `.odt` uploaded with the stand-alone template; its `First Page`
  master carries the CC-license footer. During assembly its **same-named**
  styles are now overwritten across all families by the template's definitions;
  its content is preserved, and its bytes on disk are never mutated (source
  immutability).

### Assembled quarter (existing output)

- The single merged book. After this feature, its styling in **every** family
  (paragraph, character, page, frame, list/numbering) reflects the mode's quarter
  template; content-page footers and outline numbering are preserved via the
  template's live-field `Lesson Content` master and the Node-side finalize patch.

## Configuration value (changed)

### Style-family load set (macro-local, not a typed entity)

The `loadStylesFromURL` `PropertyValue` array in `Module1.xba`. The only change:

| Family flag           | 009   | 013  |
| --------------------- | ----- | ---- |
| `OverwriteStyles`     | True  | True |
| `LoadTextStyles`      | True  | True |
| `LoadPageStyles`      | False | True |
| `LoadFrameStyles`     | False | True |
| `LoadNumberingStyles` | False | True |

This is a StarBasic literal, not a TypeScript type — there is no domain model,
DTO, or interface to define. Overwrite semantics: a template style replaces a
constituent style **only when the template also defines that name** (basis of
the research R3 monolingual-gap caveat).
