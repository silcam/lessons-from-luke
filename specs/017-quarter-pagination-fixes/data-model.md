# Data Model: Quarter Pagination and Coloring-Page Style Fixes

**Feature**: `017-quarter-pagination-fixes` | **Spec**: [spec.md](./spec.md) |
**Research**: [research.md](./research.md)

**No persistent storage changes.** No tables, no columns, no migrations, no `Persistence`
contract change, no API shape change. Every entity below is a structure inside an ODF
document or an in-process value in the assembly job. The domain database is untouched, so
constitution Principle VI's persistence mandate is not engaged.

---

## Document-level entities (ODF structures)

### Front-matter sequence

The roman-numbered run from the start of the assembled book up to and including any blank
filler page.

| Property            | Value                                                                                                                                                                                                                                                                                                                                                                                                     | Where it lives                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Number format       | lowercase roman (`style:num-format="i"`)                                                                                                                                                                                                                                                                                                                                                                  | `Front_20_matter` page layout (`Mpm12`) — and `Table_20_of_20_Contents` (`Mpm16`, bilingual only), which no committed constituent reaches                                                                                                                                                                                                              |
| Start value         | `1` (renders as `i`)                                                                                                                                                                                                                                                                                                                                                                                      | implicit at document start; explicitly anchored by finalize only if the spike shows front matter still drifts with offsets removed (contract §2.2)                                                                                                                                                                                                     |
| Offset              | **none** (invariant: no `text:page-adjust` anywhere in the book)                                                                                                                                                                                                                                                                                                                                          | footer page-number field, `Front_20_matter` master only — the sole occurrence in each asset (`-1` bilingual, `-2` monolingual). `Table_20_of_20_Contents` carries none, so the asset admits two numbering bases — but **latently**: no committed constituent pins that master, so front matter renders on one basis in this corpus (see Mode coverage) |
| First page printing | nothing (the master carrying it renders no footer — its page layout's `<style:footer-style>` is **dormant**: absent, or present with no `<style:header-footer-properties>` child. Presence of the element is not the predicate — LibreOffice emits an empty one on every switched-off layout. Several masters also carry a page-number field that never renders, so "no page-number footer" is wrong too) | master-page + page-layout structure                                                                                                                                                                                                                                                                                                                    |

**Invariants**

- INV-1 (FR-004, SC-005): no `text:page-adjust` attribute exists in the assembled book's
  `styles.xml` or `content.xml`. **Asserted on the merged output, not only on the assets**
  (`assembleQuarter.integration.test.ts`, both modes) — [static-confirmed during red-team] the
  constituents carry offsets of their own (`Front_20_matter` `-3` ×27, `HTML` `-1` ×2,
  `Body_20_Pages` `-3` ×1 across `test/docs/serverDocs/`), so removing them from the two assets
  makes INV-1 hold only via `Module1.xba`'s template style load overwriting those same-named
  masters. An asset-only assertion cannot observe a constituent-borne offset (contract §1).
- INV-2 (FR-002, FR-003): physical page 1 prints nothing and counts as `i`; physical page 2
  prints `ii`.

### Body sequence

The arabic-numbered run from lesson 1's first page to the end of the book.

| Property           | Value                                                    | Where it lives                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number format      | arabic (`style:num-format="1"`)                          | `First_20_Page` / `Lesson_20_Content` page layouts                                                                                                                                       |
| Start value        | `1`, pinned explicitly                                   | `style:page-number="1"` on lesson 1's opening heading automatic style, `content.xml`, written by finalize                                                                                |
| Continuation       | `style:page-number="auto"` on every later lesson opening | `content.xml`                                                                                                                                                                            |
| Lesson first pages | consume a number, print none                             | `First_20_Page` master, whose layout `Mpm2` has an **empty** `<style:footer-style/>` — its `<style:footer>` renders only if a constituent's **populated** layout wins the merge (INV-6b) |
| Coloring pages     | consume a number, print none                             | `Coloring_20_Page` master — footer renders `Lessons from Luke  Quarter <Q>  Lesson <N>` twice with **no** `Page <n>`, in both assets                                                     |

**Invariants**

- INV-3 (FR-005): exactly one paragraph in the book carries an explicit
  `style:page-number="1"` restart into an arabic master, and it is the first lesson's opening
  heading. The automatic style carrying the restart has that heading as its **only** referencer
  — cloned and repointed where it did not, regardless of any `style:master-page-name` already
  present, since `normalizeLessonOpeningMasterPages` trusts (and therefore does not clone)
  already-pinned styles. Where isolation is impossible (a heading on a common named style),
  finalize throws rather than skipping — a skipped restart leaves FR-005 silently unmet
  (contract §2.2/§2.3). The clone's name is deterministic, so INV-13a survives.
- INV-4 (FR-006, FR-007): for every pair of physically adjacent pages that both print a
  number, the second is the first plus one; each suppressed page between two printed numbers
  accounts for exactly one skipped value. **Suppressed pages are not only lesson title pages**
  — [static-confirmed during red-team] every lesson master pins a paragraph to
  `Coloring_20_Page`, whose footer carries no page-number field in either asset, so each
  coloring page also consumes a number silently. Any oracle assuming one suppression per lesson
  computes the wrong expected value for every page after lesson 1's coloring page.
- INV-5 (FR-016): absolute values hold at known positions, not merely relative increments. The
  "known positions" are derived from the rendered page inventory — built from the observable
  footer signatures in contract §3's page-classification table, since which master a page rode is
  **not** recoverable from `pdftotext` — never from page-count arithmetic that assumes a fixed
  number of suppressions per lesson. The inventory accounts for **every** rendered page, blank
  pages included, and it must not assume the front-matter and table-of-contents signatures are
  distinguishable: [static-confirmed during red-team] both footers render `Lessons from Luke` and
  `Teacher's Guide`, separated only by `Front_20_matter`'s `– Quarter <Q>` run. The lesson marker
  is tested on `Quarter <Q>` **and** `Lesson <N>` together, because `Front_20_matter`'s footer
  carries `Quarter <Q>` on its own.

### Blank filler page

Inserted only when parity requires it (FR-008, FR-009).

| Property            | Value                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Representation      | one empty `<text:p>` immediately before lesson 1's opening heading                                                                                                                                                                                                                                                                                                                                                                           |
| Master page         | `First_20_Page` — renders no footer, so prints nothing, and consumes one number. **Fallback**: `Standard`, likewise (contract §2.5). "Renders no footer" means **its page layout's `<style:footer-style>` is dormant** — absent, or present with no `<style:header-footer-properties>` child. Both masters carry a `<style:footer>`, and both layouts carry an empty `<style:footer-style/>`, so neither element's presence is the predicate |
| Sequence membership | front matter (it precedes the body restart). A claim about which number the filler consumes, **not** about its master — the front-matter master carries a page-number footer and would violate FR-009 (contract §2.5)                                                                                                                                                                                                                        |
| Cardinality         | 0 or 1 per book — never more                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Invariants**

- INV-6a: the inserted filler is not the only blank page in the book. [static-confirmed during
  red-team, both assets] `Inside_20_cover` uses a `style:page-usage="left"` layout (`Mpm13`) and
  the Luke-2 TOC constituent pins a paragraph to it, so LibreOffice inserts implicit blanks of its
  own. Blank pages are therefore a page class in the rendered inventory (contract §3), not an
  artifact of this feature, and INV-6's cardinality is a claim about the **filler paragraph** in
  `content.xml`, not about blank pages in the render.
- INV-6b (FR-007, FR-009): in the **assembled** `styles.xml`, the page layouts referenced by
  `First_20_Page` and `Standard` are **dormant** — `<style:footer-style>` absent, or present with
  no `<style:header-footer-properties>` child — in both modes. The assertion tests dormancy, **not**
  "carries no `<style:footer-style>`": that phrasing (a struck earlier correction) fails on the
  merged output and on the template alike, because LibreOffice emits an empty `<style:footer-style/>`
  on every switched-off layout. [static-confirmed during red-team, corrected dormancy probe]
  Both masters carry a branding `<style:footer>` — byte-identical to
  `Coloring_20_Page`'s — that renders only when the layout enables it, and **every** sampled
  constituent (`Luke-2-14v01`, `Luke-2-99v01`, `Luke-1-01v03`) does enable it (populated
  footer-style) on its own
  `First_20_Page`. The assembled book is footer-less there only because `Module1.xba`'s
  `loadStylesFromURL(OverwriteStyles=True, LoadPageStyles=True)` overwrites the layout — the same
  unstated dependency as INV-1, and load-bearing for FR-007, FR-009, and the contract §3 page
  classification. Asserted on the merged output; asset-only validation cannot observe it.
- INV-6 (FR-009): at most one filler paragraph exists, it contains no text, and it does not
  shift the body sequence (the body restart is explicit, so the filler cannot perturb it).
- INV-7 (FR-008): after insertion, lesson 1's first page falls at an odd physical index in
  the rendered PDF.
- INV-13: the filler survives a second finalize pass unchanged — `finalize(finalize(doc))`
  yields a `content.xml` byte-identical to `finalize(doc)` for both `insertRectoFiller`
  values. An empty `<text:p>` is exactly the shape `removeLeadingBlankParagraphs` and any
  contentless-paragraph normalization would delete (contract §2.4).
- INV-13a (the production path): `finalize(finalize(doc, false), true)` yields a `content.xml`
  identical to `finalize(doc, true)`. INV-13 holds the flag constant and so never exercises the
  mixed sequence contract §4 actually runs, where the second pass sees an already-restarted,
  already-repointed tree.

### Coloring-page memory-verse paragraph pair

Two paragraphs per coloring page, asymmetric in how they reach their style (research R2).

| Copy   | Style reference                                                                    | Merge fragility                                                          |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| First  | names the memory-verse style directly (`text:style-name`)                          | none                                                                     |
| Second | automatic style (`P<n>`) whose `style:parent-style-name` is the memory-verse style | **the defect surface** — the automatic style name is only locally unique |

**Invariants**

- INV-8 (FR-011, FR-013): in the assembled book, both paragraphs resolve — directly or
  through their automatic style's parent chain — to the memory-verse paragraph style.
- INV-9 (FR-012): INV-8 holds for both `M.T._20_Coloring_20_Page_20_-_20_Memory_20_Verse`
  and `Coloring_20_Page_20_-_20_Memory_20_Verse`.
- INV-10 (FR-014): the paragraph count on a coloring page is unchanged by assembly — no
  copy is removed or deduplicated.

---

## In-process values (assembly job scope, non-durable)

### `LessonOneParity`

Produced by the new render-and-measure pass (research R3), consumed by the filler decision.
Lives only for the duration of one assembly job; nothing persists it.

| Field                | Type               | Meaning                                                     |
| -------------------- | ------------------ | ----------------------------------------------------------- |
| `lessonOnePageIndex` | `number` (1-based) | physical index of lesson 1's first page in the rendered PDF |
| `needsFiller`        | `boolean`          | `true` when `lessonOnePageIndex` is even (verso)            |
| `renderedPageCount`  | `number`           | total pages in the rendered PDF, recorded for diagnostics   |

**Invariants**

- INV-11 (FR-010): every field is derived from the rendered PDF, never from an ODF page
  counter or a sum of constituent page counts — from a PDF export **pinned to include
  automatically inserted blank pages**, i.e. the Writer filter option `IsSkipEmptyPages` set to
  **`false`** (the polarity is inverted relative to the requirement's prose, so the value is always
  stated; `true` skips the blanks). Otherwise the render omits LibreOffice's implicit
  `page-usage="left"` blanks and the index is not a physical sheet position. The flag is not trusted
  on its own — the spike compares the rendered page count against a book known to carry an implicit
  blank, which is what tells an accepted filter option from a silently ignored one (contract §3).
  And from the PDF
  **the current invocation produced**. Each render pass writes its own pass-tagged output path and the parse asserts
  freshness, so a stale PDF from an earlier pass cannot silently confirm a parity that was never
  measured on the delivered document (contract §3).
- INV-12: measurement runs on the finalized-but-filler-free document, because inserting the
  filler changes the document being measured. When a filler **is** inserted, the parity is
  re-measured on the filler-carrying document and an even index fails the job — the delivered
  book is the filler-carrying one, and inserting a blank can make LibreOffice add or drop an
  implicit `style:page-usage="left"` blank (`Inside_20_cover`, present in both assets and pinned
  by the Luke-2 TOC constituent), so the first lesson does not necessarily move by exactly one
  page. A second filler is never inserted (contract §4).
- INV-14: `lessonOnePageIndex` is the index of the **unique** page satisfying the whole
  conjunction — lesson-title class (no footer, but body text), successor belonging to the
  quarter's first lesson by whole-token match of the marker built from `firstLessonNumber` (never
  the literal `Lesson 1`; the Luke-2 corpus's first lesson is `14`), predecessor absent **or not
  carrying the first lesson's marker** — a denial, not an allow-list, because "footer-less but
  texted" is not exclusive to lesson title pages: nine masters render no footer, and
  `Inside_20_cover` is reachable (pinned by the TOC constituent `Luke-2-99v01`), so an allow-list
  of blank / front-matter / table-of-contents predecessors throws on every job for that corpus
  shape (contract §3) — or
  the pass throws. The conjunction is scanned, never checked after a first lesson-title-class
  match: the book's own page 1 is lesson-title class too (FR-002 makes it footer-less), so a
  first-then-check rule would throw on every job. Two matches also throw. It is never a
  guessed or defaulted value. Page class is observed from the footer signature, not inferred
  from marker adjacency: [static-confirmed during red-team] the `Coloring_20_Page` footer
  carries the same `Quarter <Q> … Lesson <N>` marker as `Lesson_20_Content` and prints no page
  number, so both "first marker page" and "predecessor prints no number" are satisfiable by a
  coloring page (contract §3). It is never a guessed or defaulted value — a wrong parity inserts a filler that
  makes the delivered book worse than inserting none (contract §3).
- INV-15: both fields are recorded in the job's diagnostics; the extracted page text that
  produced them is never logged, and no absolute path appears in any diagnostic or curated
  reason.
- INV-16: neither field appears in the assembly job status-poll payload, whose shape is held
  unchanged (contract §7). They are server-side log diagnostics; storing them on the
  `AssemblyJobRegistry` entry requires the entry's serialized shape to be unchanged.

---

## Mode coverage

Every invariant above is asserted for **both** assembly modes (FR-015). The two template
assets are not structurally parallel, and the asymmetry is wider than research R5 records:
[static-confirmed during red-team, layout-level probe] **19 masters / 18 layouts bilingual vs
15 / 15 monolingual** (R5's "18 vs 16" is wrong on both sides; `Footnote` and `Endnote` share
`Mpm6`). Monolingual lacks `Table_20_of_20_Contents`, `Front_20_cover`, and `Back_20_cover`, and
carries `-2` where bilingual carries `-1`. `Inside_20_cover`, `Body_20_Pages`, and
`Cover_20_pages` carry a page-number footer **element** (`<style:footer>` in the master) in the
bilingual asset and **no footer element at all** in the monolingual one — none of them renders a
footer either way (their layouts' `<style:footer-style>` is dormant in both assets), so the
classification is stable, but stable for a different reason per mode. Bilingual results do not
transfer to monolingual by inspection.

Footer-rendering counts, corrected [static-confirmed during red-team, dormancy probe]: **four** of
nineteen bilingual masters render a footer (`Coloring_20_Page`, `Lesson_20_Content`,
`Front_20_matter`, `Table_20_of_20_Contents`) and **three** of fifteen monolingual. An earlier pass's
"nine masters render no footer" enumeration came from an element-presence probe and is struck; the
rendering set is stated positively because it is smaller and cannot be invalidated by a master an
enumeration omits.

**`Table_20_of_20_Contents` is a master no committed constituent uses.** [static-confirmed during
red-team, every `.odt` in `test/docs/serverDocs/`] The `-99` front-matter constituents pin only
`Front_20_matter` and `Inside_20_cover`; the rendered table of contents is a table riding
`Front_20_matter`. So front matter renders on a single numbering basis in this corpus, contract
§2.2's check (b) is stated over transitions **present in the render** rather than over that named
boundary, and the bilingual asset's `Front_20_matter`-vs-TOC offset asymmetry is latent rather than
active. `Table_20_of_20_Contents` is additionally a **paragraph-style** name in the constituents, so
a bare string grep conflates the two — master-usage checks match `style:master-page-name` only.
