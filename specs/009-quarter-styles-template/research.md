# Research: Automated Quarter-Styles Template Application (009)

Resolves the four "Deferred to Planning" questions carried from the brainstorm
(`specs/brainstorms/2026-07-11-quarter-styles-template-requirements.md`) and the
spec's "Deferred to Planning (from brainstorm)" list. Each entry uses
Decision / Rationale / Alternatives considered.

---

## R1. Where and how the template is applied in the pipeline

**Decision**: Add exactly one `oDoc.StyleFamilies.loadStylesFromURL(sUrl, oProps())`
call inside the assembly StarBasic macro (`Module1.xba` → `Assemble`), placed
**after** the constituent-insert loop and **before** `oDoc.storeToURL(...)`. The
template `file://` URL is passed to the macro via a new environment variable
(`SPIKE_TEMPLATE_URL`) set by `sofficeAssemble`, mirroring the existing
`SPIKE_FILES` / `SPIKE_OUT_URL` env-var convention. No new process, no second
`soffice` invocation.

**Rationale**: The merged, in-memory Writer document is the only point where a
single style-load covers the whole book in one pass, and it is already open in
`soffice` at that moment (zero extra process cost). This is the direction the
roadmap and brainstorm identified as inherently technical
(`StyleFamilies.loadStylesFromURL`). Reusing the `Environ()` env-var seam keeps
the wrapper↔macro contract uniform and ASCII-safe (the template path is a
controlled application asset, never a Unicode DB value).

**Alternatives considered**:

- _Post-merge Node/libxmljs2 style surgery_ (strip/patch styles in
  `finalizeAssembledQuarter`): rejected — it would make the template file
  decorative and contradict FR-001/FR-005 (the template file _is_ the
  mechanism; swapping it must change the styling with no code change). It would
  also re-derive, in imperative XML code, what LibreOffice's own style importer
  does correctly.
- _A separate second `soffice --convert`/headless pass just to load styles_:
  rejected — a whole extra process launch per job for something the already-open
  document can do in one UNO call (KISS).

---

## R2. Which style-family load flags to pass

**Decision**: Call `loadStylesFromURL` with these `PropertyValue`s:

| Property              | Value   | Why                                                        |
| --------------------- | ------- | ---------------------------------------------------------- |
| `OverwriteStyles`     | `True`  | Template's `M.T.*` paragraph styles must WIN over masters. |
| `LoadTextStyles`      | `True`  | Paragraph + character styles — carries the highlight-off.  |
| `LoadPageStyles`      | `False` | Preserve the single clean chapterized-footer page set.     |
| `LoadNumberingStyles` | `False` | Preserve the level-1 outline numbering finalize patches.   |
| `LoadFrameStyles`     | `False` | Not needed for the highlight effect (YAGNI); avoid churn.  |

**Rationale**: The observable effect (FR-002 — `M.T.*` body highlight removed)
lives on **paragraph** style properties, so `LoadTextStyles=True` +
`OverwriteStyles=True` delivers it. The two guarantees most at risk from a naïve
"load everything" are (a) the single clean un-suffixed **page-style** set with
per-lesson chapterized footers (007's `34f53a9` fix) and (b) the **outline
numbering** that `finalizeAssembledQuarter` patches downstream. Turning
`LoadPageStyles` and `LoadNumberingStyles` OFF makes the style load provably
orthogonal to both — it cannot import a competing page style or reset the
outline-level-1 start value. This directly answers the spec's FR-003
orthogonality concern by construction rather than by hope.

**Alternatives considered**:

- _`OverwriteStyles=True` with all families True_: rejected — would reintroduce
  the template's own page styles (duplicate/mismatch risk against the 007
  clean-set guarantee) and could clobber outline numbering, forcing
  `finalizeAssembledQuarter` to fight the importer.
- _`OverwriteStyles=False`_: rejected — master `M.T.*` styles would then win and
  the highlight would survive; the whole point is for the template to override.

**Verification obligation (integration test)**: because "flags are orthogonal to
footers/pagination/outline" is a LibreOffice-behavior claim, it MUST be pinned by
the golden-reference `*.integration.test.ts` re-running the existing 007 parity
axes (footers, continuous pagination, first-page suppression, single clean
master-page set, outline start value) AFTER template application, unchanged.

---

## R3. Stand-in form — direct reference vs. extracted/cleaned document

**Decision**: Ship the stand-in as a **style source document derived from the Q2
reference master, preserving its style definitions verbatim** (no highlight
editing). "Derived" means an optional content-strip for size/hygiene (a
style-only document), NOT altering any style's properties. Runtime does **no**
cleaning pass. The simplest shippable form is the reference master itself; a
content-stripped variant is an acceptable size optimization but is not required
for correctness.

**Rationale (evidence-based)**: `loadStylesFromURL` imports only style
definitions and ignores the source document's body content, so pointing at the
reference master is functionally correct as-is. Critically, the north star
(SC-001, brainstorm problem frame) is to **reproduce Chris's hand-produced,
print-ready output** — and his reference master _is_ that output. Shipping a
stand-in stricter than his own reference (by stripping highlights he left in)
would make the automated output _diverge_ from the hand result, defeating the
feature. So the stand-in must carry his style definitions unmodified.

**Finding that resolves this question (inspection of the reference master's
`styles.xml`)**: Chris's print-ready reference already has the SOP §16 target
removed — the **body** style `M.T. Text` (`style:family="paragraph"`) is
`fo:background-color="transparent"`, and nearly all `M.T.*` paragraph styles are
transparent/no-background. Three styles still carry the pale-yellow
`fo:background-color="#ffffcc"`:

| Style name (decoded)         | `style:family` | Status                                   |
| ---------------------------- | -------------- | ---------------------------------------- |
| `M.T. Text highlight`        | **text**       | Out of FR-002/SC-003 "paragraph" scope.  |
| `M.T. Text - Cover title`    | paragraph      | Intentional cover styling in his master. |
| `M.T. Text - Cover subtitle` | paragraph      | Intentional cover styling in his master. |

This means overwriting the merged book's `M.T.*` paragraph text styles from the
reference reproduces exactly the highlight-off body state Chris ships, while the
one remaining `text`-family highlight is outside SC-003's literal
paragraph-scoped wording, and the two cover paragraph styles are part of his own
print-ready reference (their intent is Chris's call, pinned to his real
template).

**Alternatives considered**:

- _Extract a cleaned template with all `#ffffcc` stripped from every `M.T.*`
  style so the literal SC-003 ("no `M.T.*` paragraph style defines a background
  highlight") holds for all three_: rejected as the default — it makes the
  automated output stricter than the reference it is meant to reproduce, on an
  unverifiable assumption that the two cover residuals are unintentional. See R5
  for how the acceptance assertion is scoped instead, and the flagged SC-003
  wording tension.
- _Point directly at the raw reference master, no derivation at all_: acceptable
  for correctness; the only downside is shipping a ~4.4 MB asset with unused body
  content. Chosen form allows (but does not require) a content-strip.

---

## R4. Where the asset lives and how its absence is validated

**Decision**: The template ships as a **committed, static application asset** at
a stable in-repo path resolved from `process.cwd()` (the Capistrano release
root, which is also how `docStorage` resolves `docs/`). Proposed location:
`assets/quarter-styles-template.odt` at repo root (a production asset directory,
distinct from `test/docs/`). Validation is **per-job**: immediately before the
`soffice` run, assembly checks the asset exists and is non-empty; on failure it
throws a curated, path-free reason and the job ends `failed` (FR-004). A cheap
startup log-warning is optional but not the gate.

**Rationale**: Capistrano checks out the whole git repo, so a committed asset is
present in every release, and `process.cwd()`-relative resolution matches the
existing `docStorage` convention (works in dev-flat and prod-nested `dist`
layouts alike — the asset is read as a data file, not resolved via `__dirname`,
avoiding the build-layout trap the macro-embedding comment documents). Per-job
validation is the honest gate: the asset is read per job, and a per-job check is
correct even if the file is added/replaced after server start (supports the
FR-005 drop-in swap without a restart). Referencing a `test/docs/` path from
production code would be a layering smell and risks the asset not shipping.

**Alternatives considered**:

- _Base64-embed the asset as a TS string_ (as the macro is): rejected — a ~4 MB
  binary bloats source and diffs; a data file resolved at runtime is cleaner and
  keeps FR-005 a true file replacement.
- _Startup-only validation_: rejected as the sole gate — it cannot see a
  post-startup asset swap and gives a worse per-job failure story; kept only as
  an optional early-warning.
- _Live under `docStorage` / `docs/`_: rejected — that tree is runtime-generated
  per-environment and swept; the template is a build-time artifact that belongs
  in version control.

---

## R5. Macro-level failure trapping (FR-004 loudness)

**Decision**: Wrap the `Assemble` sub body with `On Error Goto` handling so a
`loadStylesFromURL` failure (or any load error) aborts **before** `storeToURL`,
writing no output and exiting non-zero (or writing a sentinel the wrapper reads).
The Node side keeps two backstops: the pre-run asset-existence check (curated
reason "quarter styles template asset is missing or unreadable") and the existing
"assembly produced no result" guard in `assembleQuarter` (fires if no output was
written).

**Rationale**: "Partial books are worse than errors" (007 lineage, FR-004). An
unstyled book must never be stored as though print-ready. A macro-level trap that
skips `storeToURL` on load failure guarantees no output file exists to deliver;
the wrapper's existing not-written/empty check then surfaces a failed job. The
pre-run asset check gives a **specific** human-readable reason for the common
case (missing/unreadable asset), which is better operator feedback than the
generic backstop.

**Alternatives considered**:

- _Rely solely on the existing "produced no result" guard_: rejected — it works
  but gives a generic reason; a pre-run asset check yields a precise, actionable
  message for the deployment-bug case (FR-004 + spec Assumption that a missing
  asset is a deploy bug).
- _Continue-on-error in the macro_ (store anyway): rejected outright — violates
  FR-004 / SC-002.

---

## Cross-cutting: orthogonality with `finalizeAssembledQuarter`

`finalizeAssembledQuarter` runs in Node AFTER `soffice` writes the merged book:
it patches `styles.xml` outline-level-1 numbering and `meta.xml` book metadata,
then re-zips mimetype-first. With `LoadNumberingStyles=False` and
`LoadPageStyles=False` (R2), the in-`soffice` style load cannot touch the outline
style or page styles, so the finalize patches remain valid and are applied to a
book whose `M.T.*` paragraph styles are already template-styled. The style load
does not write metadata, so `meta.xml` finalization is untouched. This is asserted
end-to-end by the golden-reference integration test (R2 verification obligation).
