# Contract: Quarter Styles Template Application

This feature adds **no HTTP surface**. The 007 assembly REST endpoints
(`POST/GET …/assembly`, download) are unchanged — the template is applied inside
the existing pipeline, and template failure surfaces through the existing
`failed`-with-reason status body. This document is the **internal pipeline
contract** for the new step.

---

## 1. Asset resolution + validation — `quarterStylesTemplate`

```
resolveTemplatePath(): string
```

- Returns the absolute path to the shipped asset:
  `path.join(process.cwd(), "assets", "quarter-styles-template.odt")`.
- Pure/deterministic; performs no I/O.

```
validateTemplateAsset(templatePath: string): void   // throws on failure
```

- MUST throw a curated, path-free `Error` when the asset is missing or
  zero-length. The thrown message maps to the caller-facing reason
  `"quarter styles template asset is missing or unreadable"`.
- MUST NOT include the absolute path, `fs` errno detail, or any raw error text in
  the thrown message (reason-hygiene, 007 lineage).

**Unit-testable without `soffice`** (mock `fs`): present+non-empty ⇒ no throw;
missing ⇒ throws; zero-length ⇒ throws.

---

## 2. Wrapper plumbing — `sofficeAssemble`

`SofficeAssembleOptions` gains one field:

```
templatePath: string   // absolute path to the resolved, validated asset
```

- The run step (step 3) MUST set `SPIKE_TEMPLATE_URL = "file://" + templatePath`
  on the run child's env (alongside `SPIKE_FILES` / `SPIKE_OUT_URL`).
- No change to warm/inject steps, timeout, or process-group kill semantics.

**Unit-testable without `soffice`** (existing spawn seam): assert the run child's
env carries `SPIKE_TEMPLATE_URL` = `file://<templatePath>`.

---

## 3. Macro step — `Module1.xba` → `Assemble`

Between the constituent-insert loop and `storeToURL`:

```basic
' Read the template URL (set by sofficeAssemble)
sTemplate = Environ("SPIKE_TEMPLATE_URL")

' Fail loudly: a load error ⇒ abort before storeToURL (no output written)
On Error Goto TemplateFail

Dim oProps(4) As New com.sun.star.beans.PropertyValue
oProps(0).Name = "OverwriteStyles"     : oProps(0).Value = True
oProps(1).Name = "LoadTextStyles"      : oProps(1).Value = True
oProps(2).Name = "LoadPageStyles"      : oProps(2).Value = False
oProps(3).Name = "LoadNumberingStyles" : oProps(3).Value = False
oProps(4).Name = "LoadFrameStyles"     : oProps(4).Value = False

oDoc.StyleFamilies.loadStylesFromURL(sTemplate, oProps())

' CRITICAL: reset the handler so the trap covers ONLY the load — a later
' storeToURL failure MUST still hard-fail (crash → non-zero exit) as today,
' not be swallowed into TemplateFail (which could leave a partial, non-zero
' output file that passes the wrapper's existsSync+size guard).
On Error Goto 0

' ... then storeToURL + ".done" write as today ...

Exit Sub                 ' success path must NOT fall through into TemplateFail

TemplateFail:
    ' No storeToURL, no ".done" → wrapper surfaces a failed job.
    ' MUST terminate, or the process lingers until the ~100 s hard timeout.
    StarDesktop.terminate()
End Sub
```

**Contract**:

- `On Error Goto TemplateFail` MUST be **reset with `On Error Goto 0`
  immediately after** a successful `loadStylesFromURL`. StarBasic error handlers
  are procedure-scoped, not block-scoped; without the reset, a subsequent
  `storeToURL` failure would branch to `TemplateFail` and be silently swallowed
  (today it hard-fails via non-zero exit). A partial, non-zero-length `storeToURL`
  write MUST NOT be delivered — see the `existsSync + size>0` guard note below.
- The success path MUST `Exit Sub` before the `TemplateFail:` label; `TemplateFail`
  MUST call `StarDesktop.terminate()` and write no output / no `.done` sentinel,
  so a load failure fails **fast** rather than lingering until the hard timeout.
- On a load error (unreadable/corrupt asset, style-import failure), the macro
  branches to `TemplateFail` and writes **no output file** → the wrapper's guard
  in `assembleQuarter` (`!existsSync(outputPath) || size === 0`, NOT the `.done`
  sentinel) surfaces a `failed` job.
- Page styles and numbering styles MUST NOT be imported (`LoadPageStyles=False,
LoadNumberingStyles=False`) so the 007 clean page-style set and the
  `text:outline-style` chapter-numbering are untouched. Note: `LoadTextStyles=True
  - OverwriteStyles=True`DOES overwrite the heading **paragraph** styles by name,
which carry`style:default-outline-level` — so footer/outline participation is
    NOT protected by the flags and MUST be pinned by §5's footer-value assertion.
- `LoadFrameStyles=False` (avoid importing the template's frame styles; YAGNI).
- `module1Xba.ts` MUST be regenerated from the edited `.xba` via
  `scripts/genMacroConstant.js` (drift guarded by `module1Xba.test.ts`).

---

## 4. Orchestration — `assembleQuarter`

- Before calling `sofficeAssemble`: call `resolveTemplatePath()` +
  `validateTemplateAsset(...)`; on throw, end the job `failed` with the curated
  reason (reusing the existing curated-catch pattern). Pass `templatePath`
  through to `sofficeAssemble`.
- After the merge: `finalizeAssembledQuarter` runs unchanged (its outline +
  metadata patches remain valid because numbering/page styles were not imported).
- The existing "assembly produced no result" guard remains the backstop for a
  macro that aborted before writing output.

---

## 5. Behavioral guarantees verified by the golden-reference integration test

Re-run of the 007 `assembleQuarter.integration.test.ts` axes AFTER template
application, plus new assertions:

| Guarantee                                                  | Assertion                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M.T. highlight-off (NEW, FR-002/SC-003)                    | In the assembled book's `styles.xml`, the `M.T.*` **body paragraph** family has no `fo:background-color` highlight (`M.T. Text` = `transparent`/absent).                                                                                                                                                                 |
| Highlight is style-based, not direct-formatted (NEW)       | Precondition on the series-2 constituents: the M.T. highlight is defined on the **style**, not as direct run/paragraph `fo:background-color`. If direct-formatted, `loadStylesFromURL` cannot remove it and the style-scoped M.T. assertion would pass on a still-highlighted rendered book (plan Edge Cases).           |
| Footer chapter-number resolution AFTER overwrite (NEW/007) | The **discriminating** guard for the overwrite-scope risk: per-lesson footer chapter-number **values** still resolve correctly after template application. This — NOT the outline start-value row — catches heading paragraph styles losing `style:default-outline-level` when `LoadTextStyles` overwrites them by name. |
| Single clean master-page set (007)                         | Every page-style display name appears once; none carries a numeric constituent suffix — UNCHANGED.                                                                                                                                                                                                                       |
| Chapterized footers + per-lesson values (007)              | Per-lesson footer values populated; no "Lesson 99" bleed — UNCHANGED.                                                                                                                                                                                                                                                    |
| Continuous pagination + first-page suppression (007)       | Adjacent numbered pages increment by 1; each lesson's first page suppresses its number — UNCHANGED.                                                                                                                                                                                                                      |
| Outline numbering (007)                                    | Level-1 outline style `num-format="1"`, `start-value=14` (series 2) — UNCHANGED (numbering not imported). NOTE: this passes even if headings drop out of the outline, so it is **not** the outline-participation guard — see the footer-value row above.                                                                 |
| Editability                                                | No protected/linked sections introduced by the style load.                                                                                                                                                                                                                                                               |
| Source immutability (007 Pass 6)                           | Every constituent source `.odt` byte-identical after assembly — UNCHANGED.                                                                                                                                                                                                                                               |
| Corrupt-template fail-loud (NEW, US2/FR-004)               | A **corrupt** (present, non-empty, unreadable) template — distinct from a **missing** one — MUST produce a `failed` job (not a delivered book), and SHOULD confirm `--headless` makes `loadStylesFromURL` raise a trappable error rather than block on a modal dialog until the hard timeout.                            |
