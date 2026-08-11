# Contract: Assembled-Quarter Pagination and Coloring-Page Style (017)

This feature adds **no HTTP surface** and **no database surface**. The 007 assembly REST
endpoints (`POST /api/assembly/quarter`, the status poll, the download) are unchanged in
shape, status codes, and payloads. What changes is inside the assembly pipeline:

```
assembleQuarter
  ├─ makeLessonFile            (unchanged)
  ├─ prepareConstituentForAssembly   (CHANGED — only if research R2 fix direction (a) wins)
  ├─ sofficeAssemble → Module1.xba   (unchanged)
  ├─ finalizeAssembledQuarter        (CHANGED — sequence restarts, filler page)
  ├─ measureLessonOneParity          (NEW — render + measure, FR-010)
  └─ move to docStorage               (unchanged)
```

Plus two edits to committed binary assets. This document supersedes
`specs/007-assembled-quarter-download/spec.md` FR-003 on page-number offsets and odd-page
lesson starts (that requirement already carries a superseded banner pointing at 017).

---

## 1. Template assets (`assets/quarter-styles-template*.odt`)

**Change**: remove the `text:page-adjust` attribute from the `Front_20_matter` master's
footer page-number field in **both** assets (`-1` bilingual, `-2` monolingual).

**Invariant after the change (FR-004, SC-005)**:

- Neither asset contains the string `text:page-adjust` anywhere.
- No other byte of either asset changes. Master-page set, page layouts, `style:num-format`
  values, footers, and every named style are untouched.
- Both assets remain valid ODF packages with `mimetype` stored **first and uncompressed**
  (use `rezipWithMimetypeFirst`, or an in-place `zip` update of the single `styles.xml`
  entry — the technique `assembleQuarter.integration.test.ts` already uses for fixtures).

**Reproducibility requirement**: the edit ships with a committed script under
`specs/017-quarter-pagination-fixes/spike/` (or `scripts/`) that performs it from the
previous asset, so the change is reviewable as a diff of intent rather than as an opaque
4 MB binary delta.

**Validation**: `quarterStylesTemplate.test.ts` gains an assertion that neither asset
carries a page-number offset, so a future asset refresh cannot silently reintroduce one.

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
  heading — the first visible level-1 `text:h`, in document order — set
  `<style:paragraph-properties style:page-number="1"/>` alongside the existing
  `style:master-page-name="First_20_Page"`. Where the automatic style is shared with other
  content, clone-and-repoint exactly as `normalizeLessonOpeningMasterPages` already does,
  so no other paragraph inherits the restart.
- **Later lessons (FR-006, FR-007)**: unchanged — they keep `style:page-number="auto"` and
  their footer-less `First_20_Page` master, which consumes a number and prints none.
- **Front-matter anchor (FR-002, FR-003) — CONDITIONAL**: the spec's phantom-page strategy is
  to pin _each_ sequence to an explicit start value, which for front matter means
  `<style:paragraph-properties style:page-number="1"/>` on the first body paragraph of
  `office:text` (after `removeLeadingBlankParagraphs`), so `i` is anchored rather than
  inherited. Whether this is **necessary** is empirically open: front matter starts at 1
  implicitly today, and the drift's point of origin is unknown until the spike's
  "offsets zeroed" variant is read. **Decision criterion**: if that variant shows physical
  page 2 printing `ii` with offsets removed and nothing else, the anchor is redundant and is
  NOT added (Principle VII); if front matter still drifts, the anchor is added here under the
  same clone-and-repoint discipline as the body restart. Either way the invariant asserted is
  the same — physical page 2 prints `ii`.
- **Filler page (FR-009), only when `insertRectoFiller` is true**: insert exactly one empty
  `<text:p>` immediately before lesson 1's opening heading, referencing a fresh automatic
  style whose `style:master-page-name` is the footer-less `First_20_Page` master and which
  carries **no** `style:page-number` (so the front-matter count simply continues).

### 2.3 Errors

Failures continue to surface as the existing curated, path-free reason
(`"assembly failed to finalize the merged book"`). Two new fail-loud conditions, following
the `patchOutlineNumbering` precedent of throwing on a structurally impossible document:

- no visible level-1 heading found when one is required (nothing to restart at);
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

### 2.5 Filler master page and its fallback

The filler pins `style:master-page-name` to the footer-less `First_20_Page` master (research
R3, D3). Research R3 leaves open whether two consecutive `First_20_Page` pages, with the
explicit `style:page-number="1"` restart on the second, behave as intended.

**Fallback, if the spike shows it does not**: pin the filler to **`Standard`**.

**Hard constraint**: the filler's master MUST be footer-less. FR-009 requires the filler to
print no page number, and only `First_20_Page` and `Standard` satisfy that in either asset
(R1 — `Front_20_matter`, `Table_20_of_20_Contents`, and `Lesson_20_Content` all carry a
page-number footer). The filler's membership in the front-matter sequence is a claim about
which number it consumes, **not** a licence to pin it to the front-matter master, which would
print a roman numeral on a page that must print nothing.

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
- Locates lesson 1's first page as the page immediately preceding the first page carrying
  lesson 1's live footer marker (`Quarter <series> Lesson <firstLessonNumber>`), the same
  marker the integration test already keys on.
- **FR-010**: every returned value derives from the rendered PDF. No ODF page counter and no
  sum of constituent page counts may participate.
- Honours `signal` (kill the render's process group on abort) and self-kills at its own
  timeout, preserving the registry invariant in §5.
- Throws a curated, path-free reason on render failure or on a document where lesson 1's
  marker cannot be found.

**Invocation discipline** — follows `sofficeAssemble.ts`, not `webifyLesson.ts` (whose shell
`exec` with an interpolated path and shared default profile is the in-repo anti-pattern):

- `soffice`, `pdftotext`, and `pdfinfo` are spawned with **array arguments** (`spawn` /
  `execFile`), never a shell string.
- `-env:UserInstallation=file://<profileDir>` reuses the **same per-job profile directory**
  the merge already warmed (`profileDirFor(workRoot, jobId)`); the shared default profile is
  never used.
- The merge's `soffice` process group must be confirmed exited before the render starts.
- The render is spawned `detached` and killed as a process group
  (`process.kill(-pid, "SIGKILL")`) on timeout or abort.

**Locator robustness** — every one of these fails loudly rather than returning a guessed
index, because a wrong parity inserts a filler that makes the delivered book worse:

- Whole-token / anchored marker match. `Quarter <S> Lesson 1` is a strict prefix of
  `Quarter <S> Lesson 10`..`13`; `String.includes` is not sufficient.
- Marker absent (a lesson 1 with no numbered page after its footer-less title page) → throw.
- First-marker page at physical index 1, or any index outside `2..renderedPageCount` → throw.
- The candidate page must carry **no** page-number footer (lesson title pages are footer-less
  by construction, R1); if it carries one, the inference is wrong → throw.
- **Mode check (FR-015, R5)**: the spike must confirm the same footer marker exists in
  monolingual output before this locator ships. If it does not, monolingual needs its own
  anchor, or every monolingual job throws.

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
changes the document being measured. The re-finalize is XML-only (no second merge). Whether
a second render is run to _confirm_ parity after insertion is an implementation decision to
be made on measured cost; if it is, it is assertion-only and must not change the output.

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
- Default **on**.
- The off path is a real branch and carries its own integration assertion: a book with no
  filler, numbering assertions still passing.
- The warning names FR-008 explicitly and is emitted once per job, so a forgotten flip leaves
  a trace when the next complaint arrives.

**Profile and process lifetime.** Because the render reuses the merge's warmed per-job profile
(§3), `profileDirFor(workRoot, jobId)` must outlive `sofficeAssemble`'s return — teardown is
pinned to **job** lifetime (the job's `finally` / `sweepAssemblyWork`), not to the merge call.
`reapOrphanedSoffice`'s criteria are re-verified against the live render, which is exactly the
shape (a second, long-running `soffice` in the same job) that it targets.

**Diagnostics placement.** `lessonOnePageIndex` and `renderedPageCount` are server-side log
diagnostics. They are **not** added to the assembly job status-poll payload, whose shape §7
holds unchanged; storing them on the `AssemblyJobRegistry` entry is acceptable only if the
entry's serialized shape is unchanged.

**Both branches verified.** `assembleQuarter.integration.test.ts` covers the
**filler-inserted** branch as well as the no-filler branch, with the same FR-016 absolute
page-number assertions. FR-016's own reasoning applies here: the delivered defect shipped
because only relative assertions ran on one path.

---

## 5. Timeout budget (`src/server/assembly/assemblyBudget.ts`)

The render is a **second** `soffice` invocation, so:

- a new `ASSEMBLY_RENDER_TIMEOUT_MS` (the render's own self-kill) is defined, and
- `ASSEMBLY_TIMEOUT_MS = DEFAULT_TIMEOUT_MS + ASSEMBLY_RENDER_TIMEOUT_MS + ASSEMBLY_NON_SOFFICE_BUDGET_MS`.

**Invariant preserved (asserted in `assemblyBudget.test.ts`)**: the registry timeout may
fire only after every `soffice` has self-killed, so the concurrency-1 slot is never freed
while a LibreOffice process is still alive. Deriving the sum rather than hardcoding it is
what keeps the invariant structural.

The two `soffice` invocations are strictly sequential within one job, so the "never two
LibreOffice processes" guarantee is unaffected.

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
  only the automatic-style names inside the constituent copy change, and the 007
  footer/master-page machinery that also rides automatic styles must be re-verified by the
  existing integration assertions.
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
