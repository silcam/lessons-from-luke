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

' Fail loudly: no template ⇒ abort before storeToURL (no output written)
On Error Goto TemplateFail

Dim oProps(4) As New com.sun.star.beans.PropertyValue
oProps(0).Name = "OverwriteStyles"     : oProps(0).Value = True
oProps(1).Name = "LoadTextStyles"      : oProps(1).Value = True
oProps(2).Name = "LoadPageStyles"      : oProps(2).Value = False
oProps(3).Name = "LoadNumberingStyles" : oProps(3).Value = False
oProps(4).Name = "LoadFrameStyles"     : oProps(4).Value = False

oDoc.StyleFamilies.loadStylesFromURL(sTemplate, oProps())
' ... then storeToURL as today
```

**Contract**:

- On a load error (missing/unreadable asset, style-import failure), the macro
  MUST branch to a fail path that does **not** call `storeToURL` and does not
  write the `.done` sentinel → the wrapper's existing "not written / empty"
  guard in `assembleQuarter` surfaces a `failed` job.
- Page styles and numbering styles MUST NOT be imported (flags above) so the 007
  clean page-style set, chapterized footers, and the `finalizeAssembledQuarter`
  outline-numbering patch are untouched.
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

| Guarantee                                            | Assertion                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M.T. highlight-off (NEW, FR-002/SC-003)              | In the assembled book's `styles.xml`, the `M.T.*` **body paragraph** family has no `fo:background-color` highlight (`M.T. Text` = `transparent`/absent). |
| Single clean master-page set (007)                   | Every page-style display name appears once; none carries a numeric constituent suffix — UNCHANGED.                                                       |
| Chapterized footers + per-lesson values (007)        | Per-lesson footer values populated; no "Lesson 99" bleed — UNCHANGED.                                                                                    |
| Continuous pagination + first-page suppression (007) | Adjacent numbered pages increment by 1; each lesson's first page suppresses its number — UNCHANGED.                                                      |
| Outline numbering (007)                              | Level-1 outline style `num-format="1"`, `start-value=14` (series 2) — UNCHANGED (numbering not imported).                                                |
| Editability                                          | No protected/linked sections introduced by the style load.                                                                                               |
| Source immutability (007 Pass 6)                     | Every constituent source `.odt` byte-identical after assembly — UNCHANGED.                                                                               |
