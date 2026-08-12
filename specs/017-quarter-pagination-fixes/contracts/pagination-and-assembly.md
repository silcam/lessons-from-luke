# Contract: Assembled-Quarter Pagination and Coloring-Page Style (017)

This feature adds **no HTTP surface** and **no database surface**. The 007 assembly REST
endpoints (`POST /api/assembly/quarter`, the status poll, the download) are unchanged in
shape, status codes, and payloads. What changes is inside the assembly pipeline:

```
assembleQuarter
  ├─ makeLessonFile            (unchanged)
  ├─ prepareConstituentForAssembly   (CHANGED — only if research R2 fix direction (a) wins)
  ├─ sofficeAssemble → Module1.xba   (unchanged — profile lifetime is already job-scoped,
  │                                    see §4; regression guard only)
  ├─ finalizeAssembledQuarter        (CHANGED — sequence restarts, filler page)
  ├─ measureLessonOneParity          (NEW — render + measure, FR-010)
  ├─ finalizeAssembledQuarter        (CHANGED — re-run with the filler, needsFiller branch only)
  ├─ measureLessonOneParity          (NEW — mandatory confirmation render, same branch, §4)
  └─ move to docStorage               (unchanged)
```

Plus two edits to committed binary assets. This document supersedes
`specs/007-assembled-quarter-download/spec.md` FR-003 on page-number offsets and odd-page
lesson starts (that requirement already carries a superseded banner pointing at 017).

---

## 1. Template assets (`assets/quarter-styles-template*.odt`)

**Change**: remove the `text:page-adjust` attribute from the `Front_20_matter` master's
footer page-number field in **both** assets (`-1` bilingual, `-2` monolingual).

**Verified starting state** [static-confirmed during red-team]: each asset contains **exactly
one** `text:page-adjust` occurrence, on the `Front_20_matter` master's footer page-number field
(`-1` bilingual, `-2` monolingual). No other master in either asset carries an offset.

**Invariant after the change (FR-004, SC-005)**:

- Neither asset contains the string `text:page-adjust` anywhere.
- The change is **semantically** confined to that one attribute removal. Byte-identity of the
  rest of the archive is **not** the invariant and must not be asserted: `rezipWithMimetypeFirst`
  (and an in-place `zip` update) rewrites compressed streams and central-directory metadata, so a
  byte-diff DoD would be unsatisfiable. Verify instead by comparing the **extracted entries**
  before and after — the entry name list is unchanged, every entry other than `styles.xml` is
  byte-identical, and `styles.xml` differs only by the removed attribute. Master-page set, page
  layouts, `style:num-format` values, footers, and every named style are untouched.
- Both assets remain valid ODF packages with `mimetype` stored **first and uncompressed**
  (use `rezipWithMimetypeFirst`, or an in-place `zip` update of the single `styles.xml`
  entry — the technique `assembleQuarter.integration.test.ts` already uses for fixtures).

**Reproducibility requirement**: the edit ships with a committed script under
`specs/017-quarter-pagination-fixes/spike/` (or `scripts/`) that performs it from the
previous asset, so the change is reviewable as a diff of intent rather than as an opaque
4 MB binary delta.

**The inputs are not offset-free** [AUTHORITATIVE — XML-parser probe of the whole
`test/docs/serverDocs/` corpus; **supersedes the pass-13 attribution table**]. R1's "offsets are
asset-only" describes the assets, not the constituents: 30 `text:page-adjust` occurrences live in
committed lesson masters, and **all thirty sit on `Front_20_matter`** — `-3` ×28 in the lesson
constituents, `-1` ×2 in the `-99` front-matter constituents. **Struck**: the earlier rows
attributing `-1` to `HTML` and `-3` to `Body_20_Pages`. Neither master carries an offset anywhere in
the corpus; that attribution came from a regex that spans master-page boundaries (§2.5's probe-error
note) and assigns each offset to whatever master name precedes it in the file. The total of 30 is
unchanged — only the attribution was wrong.

The corpus `assembleQuarter.integration.test.ts` assembles (`Luke-2-{14..26,99}v01.odt`) is entirely
offset-carrying. `Front_20_matter` exists in **both** assets, so `Module1.xba`'s
`loadStylesFromURL(OverwriteStyles=True, LoadPageStyles=True)` is expected to overwrite it with the
fixed, offset-free definition — but that is an **unstated dependency** on the style-load's family
list and on no constituent ever introducing a master name absent from the template. Asset-only
validation cannot observe it.

**Validation** (two assertions, both required):

- `quarterStylesTemplate.test.ts` asserts neither **asset** carries a page-number offset, so a
  future asset refresh cannot silently reintroduce one.
- `assembleQuarter.integration.test.ts` asserts **zero** `text:page-adjust` occurrences in the
  **assembled book's** `styles.xml` and `content.xml`, in **both** modes. This is the assertion
  corresponding to SC-005 — the client inspects the delivered book, not the asset — and it runs on
  the offset-carrying corpus above, so it is a real test rather than a tautology.

**If the merged-output assertion fails**: strip, do not re-tune. Add an unconditional removal of
every `text:page-adjust` attribute in the merged `styles.xml` to the existing
`finalizeAssembledQuarter` styles pass — post-merge and therefore source-agnostic, making INV-1
true by construction. Per-constituent stripping in `prepareConstituentForAssembly` is the weaker
alternative (correct only for offsets the pipeline sees, and it edits 14 documents to fix one).
Neither ships speculatively; the assertion decides, and the spike's assembled book answers it as a
`grep`.

---

## 2. `finalizeAssembledQuarter` (`src/server/actions/finalizeAssembledQuarter.ts`)

### 2.1 Signature

```ts
export interface FinalizeAssembledQuarterOptions {
  odtPath: string;
  series: number;
  firstLessonNumber: number;
  title: string;
  subject: string;
  singleLanguage?: boolean;
  /** NEW — insert the blank recto filler paragraph before lesson 1 (FR-009). Default false. */
  insertRectoFiller?: boolean;
}
```

Adding an optional flag keeps every existing call site valid and makes the two-pass flow
(§4) expressible without a second entry point. Return type stays `void`; the function still
mutates `odtPath` in place and re-zips mimetype-first.

### 2.2 New behaviour, `content.xml`

Executed inside the existing content pass, after `normalizeLessonOpeningMasterPages`:

- **Body restart (FR-005)**: on the automatic style of the **first** lesson-opening
  heading — the first visible level-1 `text:h`, in document order, "visible" meaning its
  automatic style does not carry `style:text-properties/@text:display="none"` (the injected
  hidden heading) — set `<style:paragraph-properties style:page-number="1"/>` alongside the
  existing `style:master-page-name="First_20_Page"`.

  **The restart owns its style isolation; it does not inherit
  `normalizeLessonOpeningMasterPages`' skip conditions.** That function `continue`s when the
  heading rides a common **named** style (no automatic style to patch) and when the automatic
  style **already carries** a `style:master-page-name` ("existing values are trusted"). Both
  skips are wrong for the restart and both fail silently: the first means FR-005 never happens,
  the second writes the restart onto a style that is not exclusively the heading's own — an
  automatic style shared across multiple headings, still legal ODF even though LibreOffice's
  own export never produces one — and restarts numbering everywhere else that shared style is
  used, violating INV-3. So, before setting the attribute, the pass guarantees the heading
  references an automatic style whose **only** referencers are that heading — cloning and
  repointing where it is not, regardless of any master already present.

  **The clone's name is deterministic** (derived from the heading's style name, or an existing
  restart clone detected and reused), never minted by probing for the next free `_QA` suffix:
  a name that differs between passes breaks the §2.4 mixed-mode fixed point on the production
  path.

- **Later lessons (FR-006, FR-007)**: unchanged — they keep `style:page-number="auto"` and
  their footer-less `First_20_Page` master, which consumes a number and prints none.
- **Front-matter anchor (FR-002, FR-003) — CONDITIONAL**: the spec's phantom-page strategy is
  to pin _each_ sequence to an explicit start value, which for front matter means
  `<style:paragraph-properties style:page-number="1"/>` on the first body paragraph of
  `office:text` (after `removeLeadingBlankParagraphs`), so `i` is anchored rather than
  inherited. Whether this is **necessary** is empirically open: front matter starts at 1
  implicitly today, and the drift's point of origin is unknown until the spike's
  "offsets zeroed" variant is read. **Decision criterion (two checks, both required)**: (a)
  physical page 2 prints `ii`; **and** (b) the roman sequence is continuous — no repeated or
  skipped value — across **every front-matter master transition present in the rendered output**,
  vacuously satisfied when front matter renders on a single master. Check (b) is not redundant:
  the asset's front-matter masters do not all number on the same basis — `Front_20_matter` carries
  the offset while `Table_20_of_20_Contents` (also roman, layout `Mpm16`) carries none — so page 2,
  which rides `Front_20_matter`, says nothing about a boundary.

  **Check (b) is stated over transitions present in the render, deliberately, because in the
  committed corpus there are none.** [static-confirmed during red-team, every `.odt` in
  `test/docs/serverDocs/`] **No** constituent pins any paragraph to the `Table_20_of_20_Contents`
  **master page**; the `-99` front-matter constituents pin only `Front_20_matter` and
  `Inside_20_cover`, and the rendered table of contents is a table riding `Front_20_matter`. A
  criterion keyed on that named transition would therefore pass vacuously while recording evidence
  it never gathered. **Name collision warning**: `Table_20_of_20_Contents` is also a **paragraph
  style** name in the constituents (alongside `M.T._20_Table_20_of_20_Contents`,
  `Table_20_of_20_Contents_20_-_20_Table_20_heading`, `…_-_20_Scrip_20_references`), so the string
  appears in constituent XML while the master is unused — any master-usage check matches
  `style:master-page-name`, never the bare string. The monolingual asset has no
  `Table_20_of_20_Contents` master at all (R5). If both checks pass, the anchor is redundant and is NOT added
  (Principle VII); if either fails, the anchor is added here under the same clone-and-repoint
  discipline as the body restart.

- **Filler page (FR-009), only when `insertRectoFiller` is true**: insert exactly one empty
  `<text:p>` immediately before lesson 1's opening heading, referencing a fresh automatic
  style whose `style:master-page-name` is the footer-less `First_20_Page` master and which
  carries **no** `style:page-number` (so the front-matter count simply continues).

### 2.3 Errors

Failures continue to surface as the existing curated, path-free reason
(`"assembly failed to finalize the merged book"`). Two new fail-loud conditions, following
the `patchOutlineNumbering` precedent of throwing on a structurally impossible document:

- no visible level-1 heading found when one is required (nothing to restart at);
- the restart target cannot be isolated to its own automatic style (a heading on a common named
  style with no automatic style to clone) — throw rather than skip, because skipping leaves
  FR-005 silently unmet;
- `insertRectoFiller` requested but the insertion point cannot be located.

### 2.4 Idempotence

Running finalize twice on the same document must not double-insert a filler or double-apply
a restart — required by the two-pass flow in §4. The filler insertion checks for an existing
filler paragraph; the restart is an attribute set, naturally idempotent.

Stronger requirement: **finalize is a fixed point.** `finalize(finalize(doc))` produces a
`content.xml` byte-identical to `finalize(doc)`, for both `insertRectoFiller` values. This
covers not only double-insertion but every _other_ pass that re-runs on the second finalize —
in particular `removeLeadingBlankParagraphs` and any normalization that treats a contentless
paragraph as noise, either of which would silently delete the filler. Asserted as a unit test.

**Mixed-mode requirement (the production path).** The flag-constant fixed point above never
exercises the sequence §4 actually runs: `finalize(doc, false)` followed by
`finalize(·, true)`. The second call sees an already-restarted, already-repointed tree, so its
"first visible level-1 `text:h`" lookup and its clone-and-repoint run against different input
than a single `finalize(doc, true)` would. Assert it directly:

```
finalize(finalize(doc, false), true).content.xml  ≡  finalize(doc, true).content.xml
```

Both assertions ship; the mixed one is the load-bearing one.

### 2.5 Filler master page and its fallback

The filler pins `style:master-page-name` to the footer-less `First_20_Page` master (research
R3, D3). Research R3 leaves open whether two consecutive `First_20_Page` pages, with the
explicit `style:page-number="1"` restart on the second, behave as intended.

**Fallback, if the spike shows it does not**: pin the filler to **`Standard`**.

**Hard constraint**: the filler's master MUST **render no footer**, not merely no page number.

**Footer rendering is a conjunction across two XML levels, and the last three passes each got it
wrong because each probed with a regex.** [AUTHORITATIVE — re-measured with an XML parser, both
assets; **supersedes every earlier footer claim in this contract**, including the "dormancy
predicate" installed one pass ago]

A master renders a footer **iff both**: (1) the master carries a `<style:footer>` element, **and**
(2) the page layout it references carries a **populated** `<style:footer-style>` (one containing a
`<style:header-footer-properties>` child). LibreOffice emits an empty `<style:footer-style/>` on
every switched-off layout, so that element is present on all nineteen bilingual and all fifteen
monolingual layouts and its presence discriminates nothing. No `style:display` attribute appears on
any footer element in either asset.

The two conditions **coincide exactly in both assets** — so either test alone happens to work
today — but they are independent in ODF, they do **not** coincide in the constituents, and the merge
mixes both levels. Assert the conjunction. **Exactly four masters of nineteen render a footer in
bilingual** (`Coloring_20_Page`, `Lesson_20_Content`, `Front_20_matter`, `Table_20_of_20_Contents`)
and **three of fifteen** in monolingual, which has no TOC master. Every other master carries no
footer element at all and an unpopulated layout.

**The probe error, named so pass 18 does not repeat it**: passes 14–16 matched
`<style:master-page style:name="X"(.*?)</style:master-page>`. Most masters here are **self-closing**,
so the pattern runs past the named master into the next one that has a closing tag. `Standard` and
`First_20_Page` are self-closing and are followed by `Coloring_20_Page` — which is precisely how
each acquired a phantom "branding footer". **Standing requirement**: every ODF structural claim in
this contract comes from an XML parser, never a regex. A `[static-confirmed]` tag on a
regex-derived claim is not evidence.

Reinstated and struck on that authority:

- **REINSTATED — "`First_20_Page` and `Standard` carry no `<style:footer>` at all."** True; pass 14
  struck it on regex evidence and pass 16 propagated the strike. The DoD "assert the filler's master
  carries no `<style:footer>`" is satisfiable and correct on the chosen master and its fallback — it
  is simply only **half** the predicate, so generate the conjunction.
- **REINSTATED — "exactly three masters carry a `<text:page-number>` field"** (bilingual; two in
  monolingual). The pass-14 "correction" to six, adding `Inside_20_cover`, `Body_20_Pages`, and
  `Cover_20_pages`, is false — those three carry no footer element in either asset.
- **STRUCK — "`Mpm2` and `Mpm1` carry no `<style:footer-style>`."** Still false. Both carry one; it
  is empty, and a DoD written from that wording fails on the chosen master and its fallback.

**Corrected predicate (the rendering conjunction)**, binding everywhere "footer-less" or "renders no
footer" appears in this contract: a master renders no footer when it carries no `<style:footer>`
element, **or** the layout it references has no populated `<style:footer-style>`; it is safe for the
filler exactly then. `First_20_Page` and `Standard` satisfy **both** disjuncts, so the design's
choice and its fallback stand with margin. `Coloring_20_Page` (`Mpm10`) satisfies neither, and
would print branding text on a page FR-009 says prints nothing. The filler's membership in the
front-matter sequence is a claim about which number it consumes, **not** a licence to pin it to the
front-matter master, which would print a roman numeral on that page.

**Merged-output guard (new, mirrors §1's INV-1 assertion).** The template's suppression is not a
property of the delivered book; it is one the merge must win. [static-confirmed during red-team,
`test/docs/serverDocs/`] Every constituent sampled (`Luke-2-14v01`, `Luke-2-99v01`,
`Luke-1-01v03`) defines a `First_20_Page` satisfying **both** conjuncts — footer content **and** a
populated `Mpm2` — and what it renders is the **copyright and licence block**, not branding
(`Year of publication Publisher This work is licensed under the …`). `Luke-1-01v03` also renders a
footer on `Standard`, and aliases `Lesson_20_Content` to `Mpm1`. So the assembled book's title pages
are footer-less only because `loadStylesFromURL(OverwriteStyles=True, LoadPageStyles=True)`
overwrites them; a merge that fails puts a copyright line on every lesson title page and on the
FR-009 filler. (Re-probed with an XML parser in pass 17; the conclusion survives, the consequence
sharpens.) This is the same unstated dependency as INV-1, and it is load-bearing for FR-007,
FR-009, and the whole §3 page-class table. `assembleQuarter.integration.test.ts` therefore asserts
that in the **assembled** `styles.xml` the `First_20_Page` and `Standard` masters render no footer
under the **conjunction** — no `<style:footer>` element, **and** no populated `<style:footer-style>`
on the layout resolved through the master name — in **both** modes. Assert both conjuncts: each
alone is true of the template, but the constituents satisfy both, so a half-failed merge is exactly
what this guard catches. **Not** "carry no `<style:footer-style>`": that assertion fails on the
merged output for the same reason it fails on the template.

**`Mpm<n>` is a template-local name.** Automatic page-layout names are only locally unique — the
same weakness R2 documents for automatic paragraph styles. In `Luke-2-99v01`, `Mpm13` is
`Coloring_20_Page`'s layout while in the template it is `Inside_20_cover`'s. Masters are matched by
master **name** at load, so the merge is unaffected; but every `Mpm<n>` in this contract names a
**template** layout, and any check against a constituent or the merged output resolves the layout
through its master name, never by literal `Mpm<n>`.

`Standard` is also the better fallback mechanically: it makes lesson 1's heading a genuine
master-page transition rather than a same-master repeat, which is the most likely reason the
`First_20_Page`-on-`First_20_Page` arrangement would fail to honour the restart.

---

## 3. `measureLessonOneParity` (NEW)

```ts
export interface LessonOneParity {
  /** 1-based physical index of lesson 1's first page in the rendered PDF. */
  lessonOnePageIndex: number;
  /** True when lessonOnePageIndex is even — lesson 1 would open verso. */
  needsFiller: boolean;
  /** Total rendered pages, recorded for diagnostics. */
  renderedPageCount: number;
}

export function measureLessonOneParity(options: {
  odtPath: string;
  workDir: string;
  series: number;
  firstLessonNumber: number;
  signal?: AbortSignal;
}): Promise<LessonOneParity>;
```

**Contract**

- Renders `odtPath` to PDF with headless `soffice`, into `workDir` (inside the per-job
  working directory, so the existing `finally` cleanup reaps it).
- **The export is pinned to include automatically inserted blank pages** — the Writer PDF
  filter's `IsSkipEmptyPages` option ("Export automatically inserted blank pages"), set
  explicitly in the `--convert-to` filter arguments and never left to the default. FR-010's
  premise is that PDF indices are physical sheet positions; an export that drops LibreOffice's
  implicit `page-usage="left"` blanks (§3's blank class) makes the PDF shorter than the printed
  book on exactly the books that contain one, and the measured parity silently wrong.

  **The value, not just the name: `IsSkipEmptyPages` = `false` includes the blanks; `true` skips
  them.** The option's polarity is inverted relative to the requirement's prose, so every
  statement of it — here, in the plan, and in any generated task — carries the value. "Pin
  `IsSkipEmptyPages`" without a value is a coin flip that silently produces a short PDF half the
  time.

  **Mechanism is spike input, not settled.** Filter options travel as a JSON third field on the
  `--convert-to` target
  (`pdf:writer_pdf_Export:{"IsSkipEmptyPages":{"type":"boolean","value":"false"}}`), requiring
  LibreOffice ≥ 7.4. The **deploy host's `soffice` version is not established** — folded into
  research R3's existing open item on production tooling (`pdftotext` / `pdfinfo`), since one look
  at the deploy box answers both and both share the same fallback: do the work in the UNO macro
  (`Module1.xba`), which sets the filter property directly.

  **The flag is never trusted on its own**: the spike verifies the rendered page count against a
  book known to carry an implicit blank, which is what distinguishes an accepted filter option from
  a silently ignored one.

  **It binds every render, not only this one.** Invariant: _every render whose output feeds a page
  inventory, an absolute page-number assertion, or a parity claim pins `IsSkipEmptyPages` =
  `false`_ — this pass, the integration and acceptance renders, and the spike scripts alike.
  [static-confirmed during red-team, `assembleQuarter.integration.test.ts:155-178`] The integration
  test's `convertToPdf` helper currently invokes bare `soffice --headless --convert-to pdf` with no
  filter argument, so as written the oracle would render a **different page inventory** than this
  pass measures on exactly the books carrying an implicit `page-usage="left"` blank — the Luke-2
  corpus among them — and FR-016 / INV-7 would pass or fail for reasons unrelated to the delivered
  book. Satisfy the invariant **structurally**: route every such render through one exported helper
  that owns the filter argument, and have the integration test assert the argument is present, so a
  helper edit cannot silently drop it.

  **What is shared is the filter-argument construction, not the spawn mechanics.** The helper is a
  pure exported value/function in production code (colocated with `measureLessonOneParity`) that
  builds the `--convert-to` target string; the test imports it. It is deliberately **not** a shared
  spawner: production must spawn `detached`, kill by process group, and honour an `AbortSignal`
  (invocation discipline below), while the integration test's `execFileSync` needs none of that.
  Sharing the spawner would drag the process-lifecycle machinery into the test path and give the
  helper two masters; sharing the argument is the whole of what the invariant requires. If the R3 fallback moves production's option-setting into the
  UNO macro while the tests keep the JSON `--convert-to` syntax, the equivalence of the two routes
  becomes a spike-confirmation item (same page count on a book known to carry an implicit blank),
  not an assumption.

- **Page splitting is reconciled against the authoritative page count before anything is
  classified.** That count is `pdfinfo`'s today, and the UNO macro's under R3's fallback branch (no
  poppler in production) — the reconciliation rule is stated over `renderedPageCount` from whichever
  mechanism ships, and does not become optional if the fallback lands.
  [static-confirmed during red-team, `assembleQuarter.integration.test.ts:194-196`] The existing
  `pagesOf` helper is `fullText.split("\f")`, and `pdftotext` emits a form feed after **every** page
  including the last, so the split yields `renderedPageCount + 1` entries with an empty tail. Under
  the pre-017 relative assertions that was harmless; with a blank class defined as "no extractable
  text" it is not, because the tail entry is byte-identical to a genuine blank page and the INV-5
  inventory then disagrees with `pdfinfo` by one on every book. So: assert
  `parts.length === renderedPageCount + 1` **and** that the tail is empty, drop exactly one entry,
  and classify exactly `renderedPageCount` entries — a mismatch throws the curated reason rather
  than being absorbed, since it means the extraction and the count describe different documents.
  Blank-class membership is **"no extractable text after whitespace trim"**: under `-layout` an
  empty page commonly yields newlines and spaces rather than the empty string, and an exact-empty
  test misclassifies it as lesson-title class — precisely the class the locator scans for.

- Locates lesson 1's first page **by observable page class**, not by marker adjacency (see
  "Locator robustness" below). Marker adjacency is unsafe: [static-confirmed during red-team]
  the `Coloring_20_Page` footer carries the same `Quarter <Q> … Lesson <N>` marker as
  `Lesson_20_Content` and prints no page number, so "the page before the first marker page" can
  resolve to an ordinary content page.
- **FR-010**: every returned value derives from the rendered PDF. No ODF page counter and no
  sum of constituent page counts may participate.
- Honours `signal` (kill the render's process group on abort) and self-kills at its own
  timeout, preserving the registry invariant in §5.
- Throws a curated, path-free reason on render failure or on a document where lesson 1's
  first page cannot be classified.

**Invocation discipline** — follows `sofficeAssemble.ts`, not `webifyLesson.ts` (whose shell
`exec` with an interpolated path and shared default profile is the in-repo anti-pattern):

- `soffice`, `pdftotext`, and `pdfinfo` are spawned with **array arguments** (`spawn` /
  `execFile`), never a shell string.
- `-env:UserInstallation=file://<profileDir>` reuses the **same per-job profile directory**
  the merge already warmed (`profileDirFor(workRoot, jobId)`); the shared default profile is
  never used.
- The **previous** `soffice` process group — the merge before the first render, the first render
  before the re-finalize and the confirmation render — must be confirmed exited first, via the
  capped poll of §4, never an open await. The re-finalize rewrites the ODT in place over the same
  path a live render may still hold open.
- **Each render writes its own output path** (pass-tagged), and the parse asserts the PDF it reads
  was produced by the invocation that just ran — the path is unlinked beforehand, or asserted
  absent. A stale PDF from a prior pass parsed as the current one can silently confirm a recto
  guarantee that was never verified.
- The render is spawned `detached` and killed as a process group
  (`process.kill(-pid, "SIGKILL")`) on timeout or abort.

**Locator robustness** — every one of these fails loudly rather than returning a guessed
index, because a wrong parity inserts a filler that makes the delivered book worse:

**Page classification** [static-confirmed during red-team, both assets]. Each master leaves a
distinct extractable footer signature, so class is observed rather than inferred. Two limits on the
table, both load-bearing: `pdftotext` extracts **whole-page text**, not footers specifically, so
body text containing a signature string can forge a footer signature (a title page plausibly prints
"Lessons from Luke" and "Quarter <n>" in its body) — the spike's signature-confirmation item covers
adversarial body text, not only footers. And the two "absent footer" rows are **not**
master-exclusive: [XML-parser probe — supersedes the earlier "nine masters" count]
footer-rendering is the **minority** case, four masters of nineteen bilingual and three of fifteen
monolingual (§2.5); every other master renders nothing, `Inside_20_cover` among them — and it is
demonstrably reachable (the TOC
constituent `Luke-2-99v01` pins a paragraph to it). Such a page carries body text and no footer and
so reads as lesson-title class. Confirmation B below is stated as a denial for exactly this reason.

Note that the title-vs-coloring discriminator itself **does** hold, but for a mechanism the earlier
wording got wrong twice: `Coloring_20_Page` carries a doubled branding `<style:footer>` **and** a
populated `Mpm10`, while `First_20_Page` carries **no footer element** and an unpopulated `Mpm2`.
So the coloring page renders the branding line twice and the title page renders nothing — the two
classes differ on **both** conjuncts, which is what makes the discriminator robust. (Earlier
wordings had the title page carrying a dormant branding footer identical to the coloring page's;
that was a regex artifact and is struck.)

| Page class          | `Quarter <Q> … Lesson <N>`   | `Page <n>` | Other signature                             |
| ------------------- | ---------------------------- | ---------- | ------------------------------------------- |
| Lesson title page   | absent                       | absent     | no footer, but the lesson's title text      |
| Blank page          | absent                       | absent     | **no extractable text at all** (after trim) |
| Coloring page       | present **twice**            | absent     | `Lessons from Luke`                         |
| Lesson content page | present                      | present    | the lesson title                            |
| Front matter        | absent (`Quarter <Q>` alone) | present    | `Lessons from Luke` + `Teacher's Guide`     |
| Table of contents   | absent                       | present    | `Lessons from Luke: Teacher's Guide`        |

**The blank class is required, not defensive.** A page with no text is not a lesson title page,
and two kinds of blank page occur here: the filler this feature inserts (FR-009), and blanks
LibreOffice inserts on its own — [static-confirmed during red-team, both assets] `Inside_20_cover`
uses a `style:page-usage="left"` layout (`Mpm13`), and the Luke-2 TOC constituent pins a paragraph
to that master, so LibreOffice forces it verso and inserts an implicit blank when parity requires
one. Its justification is **no longer** "confirmation B would reject a blank predecessor" — B is
now a denial and accepts any predecessor without the first lesson's marker, blank included. The
blank class earns its place for two other reasons: INV-5's page inventory must account for every
rendered page, and the filler's own presence must be observable in the confirmation render so an
insertion that silently vanished (`removeLeadingBlankParagraphs`, §2.4) is caught rather than
mistaken for a parity that happened to be right.

**The signature strings are exact, and partial matching misclassifies** [static-confirmed during
red-team, both assets, rendered footer text extracted from the masters]:

| Master                    | Rendered footer text                                        |
| ------------------------- | ----------------------------------------------------------- |
| `Coloring_20_Page`        | `Lessons from Luke  Quarter <Q>  Lesson <N>` — **twice**    |
| `Lesson_20_Content`       | `Quarter <Q>  Lesson <N>  <lesson title>  Page <n>`         |
| `Front_20_matter`         | `Lessons from Luke  Teacher's Guide – Quarter <Q> Page <n>` |
| `Table_20_of_20_Contents` | `Lessons from Luke: Teacher's Guide  Page <n>`              |

Three consequences the classifier must honour:

- **The lesson marker requires both tokens.** `Front_20_matter`'s footer carries `Quarter <Q>` and
  `Lessons from Luke`, so a discriminator keyed on either alone classifies **every front-matter
  page** as coloring-page class. The marker test is `Quarter <Q>` **and** `Lesson <N>`, both on
  whole-token boundaries.
- **The coloring page's doubled marker is confirmed, not spike-pending** — the master's footer
  literally contains the run twice, once per printed half-sheet.
- **Front-matter and table-of-contents footers are near-identical**; only the `– Quarter <Q>` run
  separates them. Confirmation B no longer needs them separated (it is a denial), but INV-5's page
  inventory must not assume they are distinguishable by `Teacher's Guide` or `Lessons from Luke`.

**Rule**: `lessonOnePageIndex` is the index of the **first page satisfying the whole conjunction
below** — lesson-title class _and_ both confirmations. It is emphatically **not** "the first
lesson-title-class page, then check the confirmations": the book's own physical page 1 is also
lesson-title class, because the master carrying it renders no footer (it fails the §2.5 rendering
conjunction — note that "prints no page number" alone would _not_ imply this).
A first-then-check rule selects page 1, fails confirmation A, and throws on **every** job. The scan
continues past non-matching candidates and throws only when the whole book is exhausted.

Marker adjacency is not used, because the `Coloring_20_Page` footer
carries the same `Quarter <Q> … Lesson <N>` marker as `Lesson_20_Content` and prints no page
number — so both "first marker page" and "predecessor prints no number" are satisfiable by a
coloring page.

- Confirmation A: the page **after** the candidate belongs to the quarter's first lesson —
  coloring or content class, marker matched on a whole-token / anchored boundary.
  **The marker is built from `firstLessonNumber`**, i.e. `Quarter <series> Lesson
<firstLessonNumber>`, never the literal string `Lesson 1`: `firstLessonNumber` is
  `(series - 1) * 13 + 1`, so it is `14` for the Luke-2 corpus
  `assembleQuarter.integration.test.ts` assembles (lessons 14..26), and a literal-`1` locator
  finds nothing and throws on every real job. Whole-token matching is required at every value,
  not only at `1` — `Lesson 1` is a strict prefix of `Lesson 14`, `Lesson 2` of `Lesson 26`;
  `String.includes` is not sufficient.
- Confirmation B (**a denial, not an allow-list**): the page **before** the candidate is absent,
  **or** does not carry the first lesson's marker. An allow-list phrasing ("absent, blank,
  front-matter, or table-of-contents class") rejects an ordinary footer-less-but-texted page — an
  `Inside_20_cover` page as the last front-matter page is the concrete case — and makes the locator
  **throw on every job for that corpus shape**: deterministic, and it hard-blocks US1 and US2
  behind P3. Stated as a denial it needs no enumeration of footer-less masters, cannot be
  invalidated by a master the table omits, and still excludes the only thing that matters — a
  candidate sitting _inside_ the first lesson rather than at its start.
- **Exactly one** page in the book satisfies the conjunction. If a second matching page is
  found, the classification is wrong and the pass throws rather than taking the first.
- No page satisfying the conjunction, or a match outside `1..renderedPageCount` → throw the
  curated reason. Never a guessed or defaulted index.
- **Spike validation (FR-015, R5)**: the four signatures are confirmed against real rendered
  output in **both** modes before this locator ships — including whether the coloring and
  content footers' `Quarter`/`Lesson` runs collapse to byte-identical strings under
  `pdftotext -layout`, and where a coloring page actually falls within a lesson. The rule above
  must be correct either way; the spike settles which discriminator is cheapest, and whether
  monolingual output carries the same signatures at all.

**Diagnostics**: `lessonOnePageIndex` and `renderedPageCount` are recorded in the job's
diagnostics. Extracted page text is **never** logged (it is unpublished translation content),
and no absolute path appears in any curated reason or diagnostic.

---

## 4. `assembleQuarter` orchestration

```
sofficeAssemble
  → finalizeAssembledQuarter({ ..., insertRectoFiller: false })
  → measureLessonOneParity(...)
  → if (needsFiller) finalizeAssembledQuarter({ ..., insertRectoFiller: true })
  → move to docStorage
```

The measurement runs on the finalized-but-filler-free document because inserting the filler
changes the document being measured. The re-finalize is XML-only (no second merge).

**Confirmation render, MANDATORY on the `needsFiller` branch.** After inserting the filler,
`measureLessonOneParity` runs again on the re-finalized document, and the job fails with the
curated reason if the index is still even. This is FR-010 applied to itself rather than a cost
decision: the pre-insertion measurement is a _prediction_ about a document that is not the one
delivered, and the "+1 page" assumption behind it is not safe — inserting a blank flips downstream
parity, which can make LibreOffice add or drop an implicit `style:page-usage="left"` blank
(`Inside_20_cover`, §3), so the first lesson does not necessarily move by exactly one page. A
second filler is **never** inserted; the failure is loud. Jobs that need no filler still pay
exactly one render.

Failure of the measurement pass fails the job with a curated reason — a book delivered with
unknown parity is worse than a failed job the coordinator can retry.

**Operational kill-switch.** The measure + conditional re-finalize pass is gated by a
server-side configuration switch, default **on**. US3 (recto placement) is P3, while US1 and
US2 are the client-reported defects; without the switch, a P3 enhancement's unproven external
dependency (a second `soffice` render, plus `pdftotext`/`pdfinfo`, whose production
availability is still open in research R3) sits in the critical path of every delivery. When
switched off, `assembleQuarter` skips both the measurement and the re-finalize, delivers
without the recto guarantee, and logs one warning naming the skipped requirement (FR-008).
There is exactly one alternative behaviour — the pre-017 flow.

**Switch shape** (it is a config surface, so its shape is contractual):

- Server-side configuration only. **Never** a request parameter — §7 holds the HTTP API
  unchanged, and a per-request override would let any caller opt out of FR-008.
- **Mechanism: the environment variable `ASSEMBLY_RECTO_FILLER`**, read through a single
  exported predicate colocated with the module it gates (`measureLessonOneParity.ts`) and
  evaluated **per call**, so both branches are testable without module-cache manipulation. An
  env var rather than `secrets.json`: this is a deploy-host operational toggle, not a
  credential, and `secrets.json` is credential-shaped and regenerated from `defaultSecrets`.
- Default **on**: only an explicit `off` / `false` / `0` disables it. Unset, empty, or
  unrecognized values keep the guarantee, so a typo cannot silently ship books without it.
- The off path is a real branch and carries its own integration assertion: a book with no
  filler, numbering assertions still passing.
- The warning names FR-008 explicitly and is emitted once per job, so a forgotten flip leaves
  a trace when the next complaint arrives.
- **The failures the switch remedies point at it.** A measurement failure, and in particular a
  confirmation render still reporting an even index, is **deterministic** — the same corpus
  fails every retry identically, hard-blocking US1 and US2 (the client-reported defects) behind
  P3. The **server-side log line** for those failures names `ASSEMBLY_RECTO_FILLER` and what
  switching it off does (delivery without the recto guarantee). The **coordinator-facing**
  curated reason stays fixed-vocabulary and path-free — the remedy is an operator concern, not
  a client-visible one.

**Profile and process lifetime — already satisfied; these three modules are NOT touched.**
The render reuses the merge's warmed per-job profile (§3), so `profileDirFor(workRoot, jobId)`
must outlive `sofficeAssemble`'s return. It already does, and the three cleanup modules an
earlier revision listed as CHANGED are unchanged [all static-confirmed during red-team]:

- `sofficeAssemble.ts` owns **no** profile teardown — its only `rmSync` is the stale `.lock`
  removal. `profileDirFor` is `<workRoot>/<jobId>/profile`, inside the `jobDir` that
  `assembleQuarter`'s own `finally` already `rm -rf`s. Profile lifetime is job-scoped by
  construction; the contract here is a **regression guard** (no merge-scoped profile reap may be
  introduced, and the renders run before that `finally`), not new work.
- `sweepAssemblyWork.ts` is **startup-only** — one call site (`serverApp.ts:194`), and its body
  `rm -rf`s every entry under `workRoot` after `reapOrphanedSoffice` SIGKILLs matching process
  groups. Its doc comment pins it as safe only before any new job writes under `workRoot`.
  Routing per-job teardown through it would delete other jobs' dirs and kill live LibreOffice
  groups. It MUST NOT be called per job.
- `reapOrphanedSoffice.ts` runs only inside that startup sweep, so it can never kill a live
  render. The property to hold is the **inverse**: a render orphaned by an abrupt Node death
  (Capistrano `restart_passenger` mid-render) must stay reapable — which `matchesAssemblyJob`
  already satisfies, because the render carries the same `-env:UserInstallation=…/<jobId>/…`
  argument §3 requires it to reuse. Corollary: spawning the render against the shared default
  profile would make an orphaned render unreapable, a second reason for §3's profile rule.

No task is generated for these three beyond the regression guard above.

**Bounded wait.** The "previous process group has exited" precondition in §3 — applied before the
first render, before the re-finalize, and before the confirmation render — is a **capped**
poll with its own budget slot, never an open await — `assemblyBudget.ts`'s `ASSEMBLY_ABANDON_MS`
rationale is that unbounded awaits in the runner wedge the concurrency-1 slot for the life of
the process, and LibreOffice's `oosplash` → `soffice.bin` re-parenting is why the group-kill
machinery exists. On expiry the job fails with the curated reason; it never starts a second
`soffice` beside a live one.

**Diagnostics placement.** `lessonOnePageIndex` and `renderedPageCount` are server-side log
diagnostics. They are **not** added to the assembly job status-poll payload, whose shape §7
holds unchanged; storing them on the `AssemblyJobRegistry` entry is acceptable only if the
entry's serialized shape is unchanged.

**Existing FR-003 assertion re-derived.** `assembleQuarter.integration.test.ts` currently
locates each lesson's first numbered content page with
`pages.findIndex((p) => p.includes(marker))` and asserts its predecessor prints no number. A
coloring page carries the marker and prints no number, so for any lesson whose coloring page
precedes its first content page that lookup lands on the coloring page and the assertion checks
the wrong pair — while still passing. Re-derive it under the page classification above as part of
the FR-016 work; the existing green is not evidence.

**Inducing the filler branch.** Forcing `insertRectoFiller: true` through `assembleQuarter` on a
corpus that does not need a filler is **not** a valid way to exercise the branch: the mandatory
confirmation render above then reports an even index and fails the job by design. The branch is
entered either by a **parity-flipped fixture** (a constituent set whose front matter differs by
one page from the golden corpus, so the branch is entered for the real reason) or, as a
supplement only, by calling `finalizeAssembledQuarter({ insertRectoFiller: true })` directly and
asserting below the confirmation gate. Which is used is decided once the spike reports the golden
corpus's actual parity.

**Both branches verified.** `assembleQuarter.integration.test.ts` covers the
**filler-inserted** branch as well as the no-filler branch, with the same FR-016 absolute
page-number assertions. FR-016's own reasoning applies here: the delivered defect shipped
because only relative assertions ran on one path.

**The verification renders are held to §3's render invariants.** Both branches' assertions are read
off a PDF, so both are subject to the two rules §3 states for the production render: the export
pins `IsSkipEmptyPages` = `false` (via the shared helper, whose argument the test asserts is
present), and the page split is reconciled against `pdfinfo` before classification. Today's
`convertToPdf` and `pagesOf` helpers satisfy neither
[static-confirmed during red-team, `assembleQuarter.integration.test.ts:155-178`, `:194-196`], so
this is a change to them, not a property they already have. An oracle rendered under different
filter options than the document it is judging is the passes-while-wrong shape reproduced inside
the verification layer.

---

## 5. Timeout budget (`src/server/assembly/assemblyBudget.ts`)

The render is a **second** `soffice` invocation, and the mandatory post-insertion confirmation
render (§4) is a possible **third**, so:

- a new `ASSEMBLY_RENDER_TIMEOUT_MS` (each render's own self-kill) is defined,
- a new `ASSEMBLY_EXIT_POLL_CAP_MS` (the §4 bounded exit-poll's cap) is defined, and
- `ASSEMBLY_TIMEOUT_MS = DEFAULT_TIMEOUT_MS + 2 × ASSEMBLY_RENDER_TIMEOUT_MS + 3 × ASSEMBLY_EXIT_POLL_CAP_MS + ASSEMBLY_NON_SOFFICE_BUDGET_MS`.

The factor of two is the worst case (a filler-inserting job), carried unconditionally for the
same reason the kill-switch's allowance is carried unconditionally: deriving the budget from a
runtime branch would make the soffice-self-kills-first invariant conditional instead of
structural.

**The poll term is required, not decorative.** §4 gives the bounded wait "its own budget slot";
without a term here it has none, and the three polls per job (before render 1, before the
re-finalize, before the confirmation render) plus a second full unzip/patch/rezip would have to
fit inside `ASSEMBLY_NON_SOFFICE_BUDGET_MS` — [static-confirmed during red-team,
`assemblyBudget.ts:29`] a flat 2 min sized for the pre-017 flow and asserted only `>= 60_000`.
If they do not, the registry timeout fires while a poll is legitimately waiting on a live
LibreOffice group and frees the concurrency-1 slot with a process alive — the exact failure the
invariant below exists to prevent. The factor of three is the worst case, carried
unconditionally for the same structural reason as the render terms.

**Invariant preserved (asserted in `assemblyBudget.test.ts`)**: the registry timeout may
fire only after every `soffice` has self-killed, so the concurrency-1 slot is never freed
while a LibreOffice process is still alive. Deriving the sum rather than hardcoding it is
what keeps the invariant structural.

All `soffice` invocations (merge, render, confirmation render) are strictly sequential within
one job, so the "never two LibreOffice processes" guarantee is unaffected.

---

## 6. Coloring-page memory verse

The fix location is **conditional on research R2's headless discriminating check** and is
therefore specified as a contract on the _outcome_, not yet on the module:

- **Outcome (FR-011, FR-012, FR-013)**: in the assembled book, both memory-verse paragraphs
  on every coloring page resolve to the memory-verse paragraph style, directly or through
  their automatic style's parent, for both style-naming families and both modes.
- **Outcome (FR-014)**: the number of paragraphs on a coloring page is unchanged by
  assembly.
- **If fix direction (a)** — per-constituent automatic-style namespacing in
  `prepareConstituentForAssembly` — then that function's existing contract (in-place
  mutation of `odtPath`, returned `ConstituentMeta`, curated errors) is unchanged in shape;
  only the automatic-style names inside the constituent copy change. Two constraints on that
  rename, because a dangling reference degrades silently to default formatting — the same class
  of defect this feature exists to fix:
  - **Every referencing attribute is rewritten, not just `text:style-name`**:
    `text:cond-style-name`, `draw:style-name`, `draw:text-style-name`, `table:style-name`,
    `table:default-cell-style-name`, `text:list-style-name`, and `style:parent-style-name`
    where one automatic style parents another. A renamed style with an unrewritten referrer is
    a defect, and the pass asserts no reference to a non-existent style name survives.
  - **The 007/009/013 machinery rides automatic styles by name** —
    `normalizeLessonOpeningMasterPages` clones and repoints them to pin `First_20_Page`, and
    template application keys on them. Direction (a) re-runs the existing template-application
    and footer/master-page integration assertions as part of its own definition of done.
- **If fix direction (b)** — post-merge repointing in `finalizeAssembledQuarter` — then it
  is a further content pass under the same options object, with the same curated error.

---

## 7. What does not change

- The HTTP API (routes, status shape, download semantics, error vocabulary).
- `Persistence` and every domain type. No migration.
- `resolveTemplatePath` / `validateTemplateAsset` / `TEMPLATE_ASSET_MISSING_MESSAGE`.
- `Module1.xba` and the embedded `module1Xba.ts` constant (unless the R3 "no `pdftotext` in
  production" branch forces the page-index query into UNO — flagged open in research.md).
- Desktop, the isomorphic `core`, and the frontend. This is a server-side assembly change
  with no UI surface.
