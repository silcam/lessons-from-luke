# Contract: Quarter Template Full Style-Family Application (013)

This feature adds **no HTTP surface** and **no new function signatures**. The 007
assembly REST endpoints and the 009 template-application pipeline
(`assembleQuarter` → `resolveTemplatePath`/`validateTemplateAsset` →
`sofficeAssemble` → `Module1.xba` → `finalizeAssembledQuarter`) are unchanged in
shape. This feature changes **one thing inside the macro** — the set of style
families loaded — and re-verifies the surrounding guarantees. This document is
the internal pipeline contract for that change. It supersedes the 009 contract's
§3 flag table and §5 guarantee "Outline numbering — UNCHANGED (numbering not
imported)".

---

## 1. Unchanged from 009

- **§1 Asset resolution + validation** (`quarterStylesTemplate.ts`:
  `resolveTemplatePath(singleLanguage)` / `validateTemplateAsset(path)`) —
  unchanged. Mode selection (monolingual vs bilingual asset) is unchanged.
- **§2 Wrapper plumbing** (`sofficeAssemble.ts`: `SPIKE_TEMPLATE_URL` env) —
  unchanged.
- **§3 macro error handling** (`On Error Goto TemplateFail`, the
  `On Error Goto 0` reset immediately after the load, the pre-load hidden-doc
  open forcing a trappable parse, `Exit Sub` before the label,
  `StarDesktop.terminate()` in the handler) — unchanged (FR-006 inherits 009
  FR-004).
- **§4 orchestration** (`assembleQuarter` validates then threads `templatePath`;
  `finalizeAssembledQuarter` runs after the merge) — unchanged in shape. Note:
  finalize's outline/metadata patches now run against a book whose page/frame/
  numbering styles _were_ imported (see §3 below), and finalize still wins the
  outline start value by running last (research R4c).

---

## 2. Node/unit surface — no change

No TypeScript signature, option, or type changes. `quarterStylesTemplate.ts`,
`sofficeAssemble.ts`, and `assembleQuarter.ts` public shapes are identical to 009. The only production code that changes is the StarBasic macro string and its
regenerated embedding.

---

## 3. Macro step — `Module1.xba` → `Assemble` (CHANGED: family flags)

The `loadStylesFromURL` `PropertyValue` array changes **three values** from
`False` to `True`; everything else in the block is unchanged:

```basic
Dim oProps(4) As New com.sun.star.beans.PropertyValue
oProps(0).Name = "OverwriteStyles"     : oProps(0).Value = True
oProps(1).Name = "LoadTextStyles"      : oProps(1).Value = True
oProps(2).Name = "LoadPageStyles"      : oProps(2).Value = True   ' was False (013 FR-002/FR-003)
oProps(3).Name = "LoadNumberingStyles" : oProps(3).Value = True   ' was False (013 FR-005 safe, research R4c)
oProps(4).Name = "LoadFrameStyles"     : oProps(4).Value = True   ' was False (013 FR-003)

oDoc.StyleFamilies.loadStylesFromURL(sTemplate, oProps())
```

**Contract**:

- All five families load with `OverwriteStyles=True` — the template's same-named
  styles win in **every** family, matching the curriculum owner's manual "load
  all families + Overwrite" process (FR-001).
- The explanatory comment above the block MUST be rewritten: it currently claims
  page/numbering/frame styles are left off "so per-lesson footers and pagination
  are unaffected." The new comment MUST state that all families are loaded with
  overwrite, that the footer-less `First Page` master intentionally wins
  (FR-002), and that per-lesson footers survive because the template's
  `Lesson Content` master carries live `text:chapter`/`text:user-defined`/
  `text:page-number` fields (research R2/R4a).
- `module1Xba.ts` MUST be regenerated from the edited `.xba` via
  `scripts/genMacroConstant.js` (drift-guarded by `module1Xba.test.ts`).
- The error-handling block (§1) is NOT touched by this change.

---

## 4. Behavioral guarantees verified by the golden-reference integration test

Re-run of the existing 007/009 axes AFTER the flag flip, plus new assertions.
Rows marked **NEW** or **RE-VERIFY** are the ones this feature turns from
"protected by construction" into "actively asserted."

| Guarantee                                              | Assertion                                                                                                                                                                 | Status                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **First-page footer removed (FR-002/SC-001)**          | No lesson first page in the merged book renders any footer; the CC license text occurs **only** within the TOC section. `First Page` master has no `<style:footer>`.      | **NEW**                         |
| **Lesson-opening spacing (FR-003/SC-002)**             | Lesson-opening spacing (number graphic ↔ title ↔ overview header) matches the mode's quarter master. Outcome-based; see research R3 caveat for the monolingual style gap. | **NEW** (round-trip + SC-005)   |
| **Per-lesson content footers resolve (FR-004/SC-003)** | Each lesson's content-page footer shows its OWN absolute lesson number (`text:chapter` value), not a stale/uniform value, AFTER page styles are overwritten.              | **RE-VERIFY** (was under False) |
| **Single clean master-page set (FR-004)**              | Every master-page display name appears ONCE; none carries a numeric `NN` constituent suffix; no duplicate/orphan page sets from the import.                               | **RE-VERIFY** (page load on)    |
| **Continuous pagination + first-page suppression**     | Adjacent numbered pages increment by 1; each lesson's first (title) page suppresses its page number — now driven by the template's footer-less `First Page` master.       | **RE-VERIFY**                   |
| **Outline / TOC numbering (FR-005/SC-003)**            | Level-1 outline style `num-format="1"`, `start-value` = quarter's first absolute lesson number; TOC lists all 13 lessons, correct order/numbers. Finalize wins (R4c).     | **RE-VERIFY** (numbering on)    |
| **Editability**                                        | No protected/linked sections introduced by the fuller style load.                                                                                                         | UNCHANGED                       |
| **Source immutability**                                | Every constituent source `.odt` byte-identical after assembly.                                                                                                            | UNCHANGED                       |
| **Corrupt / missing template fail-loud (FR-006)**      | A corrupt (present, unreadable) template and a missing asset both produce a `failed` job, never a delivered book.                                                         | UNCHANGED (009)                 |
| **Stand-alone single-lesson download (FR-007)**        | A single-lesson download still carries its stand-alone `First Page` CC footer — this pipeline is not invoked for single lessons.                                          | UNCHANGED (out of pipeline)     |

**Both modes**: the FR-002 / FR-003 / FR-004 / FR-005 axes MUST be asserted for
**both** the bilingual and single-language templates (the two assets carry
different master-page/style sets — Edge Cases). The existing monolingual
integration describe-block is the seam for the single-language assertions.
