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

| Property            | Value                                                            | Where it lives                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number format       | lowercase roman (`style:num-format="i"`)                         | `Front_20_matter` / `Table_20_of_20_Contents` page layouts, template assets                                                                        |
| Start value         | `1` (renders as `i`)                                             | implicit at document start; explicitly anchored by finalize only if the spike shows front matter still drifts with offsets removed (contract §2.2) |
| Offset              | **none** (invariant: no `text:page-adjust` anywhere in the book) | footer page-number field, template assets                                                                                                          |
| First page printing | nothing (its master carries no page-number footer)               | master-page structure                                                                                                                              |

**Invariants**

- INV-1 (FR-004, SC-005): no `text:page-adjust` attribute exists in the assembled book's
  `styles.xml` or `content.xml`.
- INV-2 (FR-002, FR-003): physical page 1 prints nothing and counts as `i`; physical page 2
  prints `ii`.

### Body sequence

The arabic-numbered run from lesson 1's first page to the end of the book.

| Property           | Value                                                    | Where it lives                                                                                            |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Number format      | arabic (`style:num-format="1"`)                          | `First_20_Page` / `Lesson_20_Content` page layouts                                                        |
| Start value        | `1`, pinned explicitly                                   | `style:page-number="1"` on lesson 1's opening heading automatic style, `content.xml`, written by finalize |
| Continuation       | `style:page-number="auto"` on every later lesson opening | `content.xml`                                                                                             |
| Lesson first pages | consume a number, print none                             | footer-less `First_20_Page` master                                                                        |

**Invariants**

- INV-3 (FR-005): exactly one paragraph in the book carries an explicit
  `style:page-number="1"` restart into an arabic master, and it is lesson 1's opening
  heading.
- INV-4 (FR-006, FR-007): for every pair of physically adjacent pages that both print a
  number, the second is the first plus one; a suppressed page between two printed numbers
  accounts for exactly one skipped value.
- INV-5 (FR-016): absolute values hold at known positions, not merely relative increments.

### Blank filler page

Inserted only when parity requires it (FR-008, FR-009).

| Property            | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Representation      | one empty `<text:p>` immediately before lesson 1's opening heading |
| Master page         | footer-less (`First_20_Page`) — prints no number, consumes one     |
| Sequence membership | front matter (it precedes the body restart)                        |
| Cardinality         | 0 or 1 per book — never more                                       |

**Invariants**

- INV-6 (FR-009): at most one filler paragraph exists, it contains no text, and it does not
  shift the body sequence (the body restart is explicit, so the filler cannot perturb it).
- INV-7 (FR-008): after insertion, lesson 1's first page falls at an odd physical index in
  the rendered PDF.

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
  counter or a sum of constituent page counts.
- INV-12: measurement runs on the finalized-but-filler-free document, because inserting the
  filler changes the document being measured.

---

## Mode coverage

Every invariant above is asserted for **both** assembly modes (FR-015). The two template
assets are not structurally parallel (research R5 — the monolingual template has no
`Table_20_of_20_Contents` master and carried a different offset), so bilingual results do
not transfer to monolingual by inspection.
