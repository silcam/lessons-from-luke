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
  - **No headers anywhere:** neither asset defines a `<style:header>` on any
    master page (0 headers in both `styles.xml`, verified 2026-07-23). So
    `LoadPageStyles=True` imports footer content only — there is no template
    header content to introduce, and the FR-002/FR-004 footer reasoning is
    complete on the header axis. (A constituent content-page header, if any ever
    existed, would be stripped by the header-less template master under
    template-wins — no evidence any constituent carries one, and the spec never
    references headers.)
  - **Master-page-set gap (single-language):** the monolingual template defines
    **fewer master pages** than the bilingual one. Bilingual carries
    `Table_20_of_20_Contents`, `Front_20_cover`, and `Back_20_cover` masters
    (and 4 footer blocks); the monolingual template omits those three TOC/cover
    masters (and has 3 footer blocks). Because `loadStylesFromURL` imports styles
    (incl. master pages) but **not** body content, a master the mono template
    lacks is simply not imported — the constituent/merge master for that name
    survives, exactly as under 009 (page styles off). This introduces **no
    regression** vs. the 009 mono baseline for those masters, and does not
    threaten FR-002 (CC text lives in TOC-section _body content_, not governed by
    a master page). Recorded for asset-inventory completeness alongside the
    paragraph-style gap below.
  - `Lesson Content` master page footer: entirely field-driven (no static book
    text) — live `text:chapter[number]` (absolute lesson number),
    `text:chapter[name]` (per-lesson name), `text:user-defined[Quarter]`,
    `text:title` (book title), and `text:page-number` (both assets). These fields
    ship with **stale cached sample values** (mono: Quarter 4 / Lesson 51-52; bi:
    Quarter 2 / Lesson 26); after 013 makes this master authoritative, they must
    re-resolve against the merged book's metadata/outline that
    `finalizeAssembledQuarter` patches (`Quarter` user-defined, `dc:title`,
    outline start-value) — else the cached values ship silently (see plan Edge
    Cases + contract §4 FR-004 axis).
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
