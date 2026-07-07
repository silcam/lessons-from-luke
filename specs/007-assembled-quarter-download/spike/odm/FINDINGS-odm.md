# WS-2a′ Spike Findings — `.odm` master-document quarter assembly (approach A1)

**Feature:** `007-assembled-quarter-download` · **Sibling of:** the WS-2a A2 spike
([`../FINDINGS.md`](../FINDINGS.md), committed `21f8a4d`)
**Date:** 2026-07-07 · **Machine:** macOS (Darwin 24.6), LibreOffice 25.8.3.2 (`/opt/homebrew/bin/soffice`)

## Verdict: **NO-GO on the pagination gate** ❌ — proceed with A2; `.odm` does not fix the +1 offset

The gate question was: **does the `.odm` master-document route (Chris's manual SOP
§13–§15 workflow, scripted) deliver book-correct pagination that A2's
`insertDocumentFromURL` route does not** — specifically, eliminate A2's **+1
page-number offset** and/or land lessons on **odd/right-hand rectos**?

**Answer: no — confirmed against Chris's real master document as ground truth.** Three
independent renders of these same Luke-2 inputs — (1) A2's committed output, (2) this
spike's scripted `.odm`, and (3) **Chris's actual `English_Luke-Q2-Master-bilingual.odm`
downloaded from Drive and rewired to the Luke-2 English sources** — all exhibit the
**same +1 page-number offset** (lesson 1's first page suppressed at would-be page 5;
the next page prints **6** — i.e. printed = physical + 1) and **none start lessons on
odd rectos**. The `.odm` structure encodes no numbering fix (Chris's master has **zero
`text:page-adjust` / page-number-offset fields** and no per-sub-document page-style
continuation), so it is **not a property the `.odm` route buys**. _(Inference, not
verified: Chris's published books are presumably offset-correct via manual post-export
numbering work — his final PDF was not inspected. It does not matter for the verdict:
headless A1 ties headless A2 on the offset regardless of what Chris does by hand.)_

Per the plan's gate-first decision rule — _"if `.odm` does NOT beat A2 on pagination →
STOP (NO-GO): plan proceeds with A2 + fix the +1 offset in the insert route"_ — this
spike **stops at the gate**. Phases 1–3 plumbing (scripted detach, image-intactness)
were **not pursued**.

**One secondary finding that is NOT a gate factor but matters for planning:** Chris's
real master (protected linked sections) **does preserve per-lesson footer Lesson
numbers** (renders `14, 15, 16 … 25` incrementing per lesson) where A2 renders them
**blank**. This is the exact Q4 gap A2 documented — see "Footer nuance" below. It does
not rescue the failed pagination gate, but it is a concrete lead for A2's footer-flatten
work.

## Premise reconciliation (why "the manual `.odm` provides correct numbering today" is not contradicted)

The roadmap (line ~112) says _"continuous page numbering across lessons is exactly what
the manual `.odm` step provides today."_ That is about **continuity** — numbers not
restarting per lesson — which **both** A2 and A1 provide (verified: no per-lesson reset
in any render). It is **not** a claim that the manual `.odm` eliminates the **+1
offset**; that was this spike's _hypothesis_, now **disproven** on ground truth (Chris's
own master reproduces the offset in a headless render). Whatever makes Chris's published
books offset-correct (plausibly a manual post-export numbering pass — _not verified
here_) is **not encoded in the `.odm` file**. So: no contradiction — the premise holds,
the hypothesis fails, and the offset fix is a post-assembly step **regardless of
assembly route**.

## The gate measurement (head-to-head, three renders of identical Luke-2 inputs)

Fixed baseline (on disk, not regenerated): `../out/Luke-2-assembled.pdf` (A2, 91 pp).
New A1 artifacts: `out/Luke-2-odm.pdf` (scripted `.odm`, 91 pp) and
`out/Chris-Q2-rewired.pdf` (**Chris's real master**, rewired to Luke-2 English sources,
87 pp). Method: per-physical-page last-token dump (`pdftotext -layout` + awk) — the same
page-number-footer pre-screen `verify.sh` uses — diffed page-by-page.

| Dimension                    | A2 (`insertDocumentFromURL`)                   | A1 scripted `.odm`                                                           | A1 Chris's real master                      | Gate?                            |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| Total pages                  | 91                                             | 91                                                                           | 87 (different sub-doc break behavior)       | —                                |
| **+1 page-number offset**    | present (p05 prints **6**)                     | **present — identical** (p05 prints **6**)                                   | **present** (p05 prints **6**)              | **all tie → gate FAILS**         |
| **Odd/right-hand rectos**    | no (starts on even pages)                      | **no — identical**                                                           | **no**                                      | **all tie → gate FAILS**         |
| First-page suppression       | yes                                            | yes — identical                                                              | yes                                         | tie                              |
| Per-page number footers      | —                                              | **identical to A2 on all 91 pages** (`diff`=0)                               | same offset pattern                         | tie                              |
| Footer Lesson/Quarter number | **blank**                                      | blank (unprotected sections)                                                 | **per-lesson `14…25`** (protected sections) | not a gate factor; A1-Chris wins |
| Native sub-doc page breaks   | needs manual `PAGE_BEFORE` (78 pp without)     | breaks natively (no hack)                                                    | breaks natively                             | A1 (minor)                       |
| Self-contained editable .odt | **yes** (4.1 MB, 0 links)                      | **no** (42 KB shell, 14 links)                                               | **no** (linked/protected)                   | **A2**                           |
| Extra mechanism cost         | none                                           | authoring + unproven scripted §15 detach                                     | authoring + detach                          | **A2**                           |
| Self-contained editable .odt | **yes** (`storeToURL` embeds; 4.1 MB, 0 links) | **no** (master `storeToURL` writes a 42 KB shell; 14 links remain, 0 images) | **A2**                                      |
| Extra mechanism cost         | none                                           | master-shell authoring **+ unproven scripted §15 detach**                    | **A2**                                      |

**Decisive line:** the +1 offset and even-page lesson starts appear in **all three**
renders — A2, the scripted `.odm`, and Chris's real master. No route reproduces the
book-correct pagination the spike hoped `.odm` would provide.

## Ground-truth validation against Chris's real master document

To rule out "my scripted `.odm` is an unfaithful approximation of Chris's real one," his
actual master was fetched from Drive and inspected:

- **File:** `English_Luke-Q2-Master-bilingual.odm` (Drive id
  `1nK7LZHjgCLeA4JAXWJVey2L_jwmiZhne`, owner `chris_jackson@sil.org`, 458 498 bytes) —
  the **same quarter** (Q2 = series 2, lessons 14–26) this spike assembles. (Q1/Q3/Q4
  masters also exist, same naming.)
- **Structural diff vs the scripted `.odm`:** essentially the same mechanism — a **flat
  list of 14 file-linked `text:section-source` sections** in the same order (TOC, L14…L26).
  Differences are cosmetic to pagination: Chris's sections are `text:protected="true"`
  (mine were unprotected), named by filename (mine `Sec1…Sec14`), and his
  `<text:section-source>` carries **no** `text:filter-name` (mine set `writer8`).
  Crucially, Chris's master has **no `text:page-adjust`, no page-number-offset field,
  and no per-sub-document page-style continuation** — nothing my version lacks that
  would correct numbering.
- **Rewire + render:** Chris's master's 14 hrefs were rewired to the Luke-2 English
  sources (`out/Chris-Q2-rewired.odm`) and rendered via the same FULL_UPDATE reload.
  Result: **87 pages** (fewer than A2's 91 — his section styles break sub-docs slightly
  differently) but the **same +1 offset** (p05 prints `6`) and **no odd rectos**.

**Conclusion:** the scripted `.odm` is structurally faithful, and even Chris's authentic
master reproduces the offset under headless LibreOffice. The NO-GO on pagination rests on
ground truth, not on a possibly-broken reconstruction.

## Footer nuance (secondary, not a gate factor) — A1 preserves per-lesson footer numbers

This is the one place A1 genuinely differs from A2, and it emerged only from the
ground-truth render:

- **A2 and the _scripted_ (unprotected) `.odm`** render the footer Lesson/Quarter number
  **blank**.
- **Chris's real master (protected linked sections)** renders them **correct per lesson**.

_Confirmation:_ `pdftotext | grep -oE "Lesson 1[4-9]|Lesson 2[0-6]"` on Chris's render
shows all 13 numbers `14…26` present, **~10 occurrences each** (footer on every page of
the lesson); A2's render shows only **~3 each** (body heading/running-head only) and is
**missing `Lesson 20` and `Lesson 26` entirely**. The ~10-vs-~3 differential is the
footer signal (the direct per-physical-page token diff is misaligned because Chris's
render is 87 pp vs A2's 91 pp, so it is corroborating, not primary).

So the discriminator is the **`text:protected="true"` linked-section form**: FULL*UPDATE
appears to embed each sub-document's own footer field values per-section, sidestepping the
single-`meta.xml`-namespace collision that blanks A2's fields (A2 FINDINGS caveat 5). An
in-memory probe (`updateLinks()` on a live unprotected `GlobalDocument`) instead rendered
`14` on **every** lesson — a single cached value bleeding across all 13 — which is \_not*
the real-master behavior; discount that probe reading.

**Why this does not change the verdict:** the gate is pagination (the priority per spec
FR-003 and the roadmap), and A1 loses it. But this is a concrete, actionable lead for
A2's required footer-flatten work — either replicate the protected-linked-section trick
for footers, or (simpler, route-independent) pre-flatten each lesson's footer
`text:user-defined` fields to literal text before assembly. Worth verifying during
`/sp:03-plan`.

## Answers to the plan's "unknowable without running" list

1. **Does `.odm` eliminate the +1 offset? (the gate)** — **No.** Identical +1 offset.
2. **Does `--convert-to odt` resolve links, or is UNO `FULL_UPDATE` required?** —
   `FULL_UPDATE` on reload is required to resolve links headlessly without a dialog
   hang; it renders (PDF) correctly. See #3 for what it does _not_ do.
3. **Does the export embed content-in-sections vs lazy-link?** — **Neither, via
   `storeToURL`.** Saving the FULL*UPDATE-loaded **master document** back out as
   `writer8` writes a **42 KB shell**: the 14 `text:section-source` links remain and
   **0 images / 0 body paragraphs** are embedded. Content is present for \_rendering*
   (the 4.45 MB PDF proves it) but is **not flattened into the `.odt`**. Chris's manual
   §14.3 step ("open the exported `.odt`, click Yes to update links") pulls content into
   a **non-master** text doc — a separate reopen the `storeToURL` path skips. So the
   scripted §15 detach (Phase 3) is **not even reachable** from the master `storeToURL`
   output; it would first need that reopen-as-text-and-embed step. Moot under NO-GO.
4. **Do the footer `text:user-defined` fields resolve from cache or go blank?** —
   **Depends on the section form.** Unprotected linked sections (my scripted `.odm`) →
   **blank**, same as A2. **Protected** linked sections (Chris's real master) → **correct
   per-lesson `14…25`**. See "Footer nuance" above — this is A1's only real advantage,
   and it is not a gate factor.
5. **Does breaking `FileLink` via UNO preserve content? (Phase-3 fallback)** — **Not
   tested** (gate failed; Phase 3 skipped).
6. **Does a flat-master (`.fodm`) export filter exist?** — **Not tested** (not needed).

**Bonus (plan sub-question): is A2's manual `PAGE_BEFORE` boundary hack needed?** In the
`.odm` route, **no** — the master document breaks each sub-document onto a fresh page
**natively** (this spike authored the shell with only paragraph breaks, no
`PAGE_BEFORE`, and still got 91 pages with correct lesson starts). This is a minor
mechanistic nicety, **not** a reason to switch: A2's one-line `PAGE_BEFORE` already
solves it, and it does not touch the offset or odd-page policy.

## Mechanistic notes / sharp edges discovered (for the record)

1. **Relative-path → malformed `file://` URL hangs the headless macro.** Passing a
   **relative** output path made `SPIKE_OUT_URL=file://out/…` (host=`out`), and the
   macro's `storeToURL`/`Open` on that bad URL **hung soffice indefinitely** with **no
   error dialog and no log** — indistinguishable at a glance from a compile hang. This
   caused a ~1.5 h dead-end before diagnosis. `build-odm.sh` now **absolutizes the
   output path** before deriving any `file://` URL. _Lesson for the real feature: always
   build UNO URLs from absolute paths; validate before dispatch._
2. **Headless soffice must never be allowed to pop a modal dialog** — it blocks forever.
   The macro wraps every sub in `On Error Goto … log + StarDesktop.terminate()`, and the
   `.log` file appearing within a few seconds is the "it dispatched" signal (no `.log`
   in ~20 s ⇒ compile error ⇒ kill immediately, never wait).
3. **LO writes section-source hrefs off-by-one relative** to the `.odm` location
   (six `../` where five were correct), so a naive save→reload finds **broken links** and
   silently renders **empty sections** (18 KB `.odt`, 0 content). The genuine measurement
   required **patching the hrefs to absolute** `file://` URLs in the `.odm`'s
   `content.xml` (re-zipped mimetype-first) before the FULL*UPDATE reload. \_For a real
   feature this is a live risk of the `.odm` route that A2 does not have.*
4. Same environment constraints as WS-2a hold: LO bundled Python SIGKILLed locally
   (drive via Basic macro); single-instance on macOS (serialize; reap `soffice.bin`
   between runs — a leftover instance makes the next launch hang via forwarding); Bash-
   tool dispatch **does** work when the environment is clean (verified by re-running the
   A2 `assemble.sh` control to a scratch path — completed in ~35 s).

## Exact working invocations

```bash
# Author the .odm shell + FULL_UPDATE reload + export merged .odt in one soffice run:
./build-odm.sh Luke 2                       # -> out/Luke-2-odm.{odm,odt}

# Genuine .odm render (the measured artifact): rebuild shell, patch hrefs absolute,
# reload with FULL_UPDATE, export .odt + .pdf. See the "RenderOdm" path:
SPIKE_STAGE=odm ./build-odm.sh Luke 2        # build shell only
#   ... patch out/Luke-2-odm.odm section-source hrefs to file:// absolute, re-zip mimetype-first ...
SPIKE_KEEP_ODM=1 SPIKE_MACRO=RenderOdm ./build-odm.sh Luke 2   # -> out/Luke-2-odm.pdf (4.45 MB, 91 pp)

# Head-to-head pagination diff (three renders):
pdftotext -layout ../out/Luke-2-assembled.pdf a2.txt      # A2 baseline
pdftotext -layout out/Luke-2-odm.pdf          odm.txt     # scripted .odm
pdftotext -layout out/Chris-Q2-rewired.pdf    chris.txt   # Chris's real master, rewired
#   per-page last-token dump of each, then `diff`. scripted .odm vs A2 -> 0 differing
#   lines on page numbers; Chris's master -> same +1 offset (p05 prints 6), 87 pp.

# Ground truth: fetch + rewire Chris's real master (Drive id 1nK7LZHjgCLeA4JAXWJVey2L_jwmiZhne)
#   download_file_content -> base64 -d -> unzip; rewire section-source hrefs (../English_Luke-Q2-*.odt
#   -> file:// Luke-2 English sources) in content.xml; re-zip mimetype-first; RenderOdm.
```

Reaping between runs (single-instance hygiene): `pkill -9 -f soffice`.

## Deliverables in this directory

- `build-odm.sh` — driver (warm profile, install macro, author `.odm`, FULL_UPDATE
  reload, export). `SPIKE_STAGE=odm` stops after the shell; `SPIKE_KEEP_ODM=1` +
  `SPIKE_MACRO=RenderOdm` renders a hand-patched/rewired `.odm`.
- `macro-template/basic/Standard/Module1.xba` — `BuildAndExport` (author+reload+store),
  `RenderOdm` (reload patched `.odm` → `.odt`+PDF), `BuildProbe` (in-memory live-doc
  render — the false-positive footer path, kept for provenance), `Ping` (compile check),
  hardened with `On Error` handlers.
- `out/Luke-2-odm.{odm,odt,pdf}` — scripted `.odm` shell, its 42 KB `storeToURL` output
  (links not embedded — evidence for "unknowable" #3), and its 91 pp render.
- `out/Chris-Q2-rewired.{odm,odt,pdf}` — **Chris's real Q2 master**, rewired to the
  Luke-2 English sources and rendered (87 pp, same +1 offset, per-lesson footer numbers).

## Thread / destination

- **This is the second assembly-feasibility gate.** WS-2a (A2) = **GO** with two
  planning gaps (+1 offset, footer-number flatten). WS-2a′ (A1 `.odm`) = **NO-GO on the
  pagination gate**: A2, the scripted `.odm`, and Chris's real master all share the +1
  offset and even-page starts, so `.odm` does not fix the gap that motivated it — while
  adding master-authoring + unproven-detach cost and losing A2's self-contained `.odt`.
- **Mechanism decision for `koog.2` `/sp:03-plan`: proceed with A2**
  (`insertDocumentFromURL`). Treat the **+1 offset** as a route-independent, manual/
  scriptable post-assembly numbering fix (it is inherent to headless rendering of these
  inputs — present in Chris's own master — so compare against Chris's published reference
  output to define the target). For the **footer-number** gap, note A1's lead: Chris's
  **protected linked-section** master preserves per-lesson footer numbers where A2 blanks
  them — either adopt that trick or pre-flatten footers (A2 FINDINGS caveat 5).
- Cross-linked with the A2 spike: [`../FINDINGS.md`](../FINDINGS.md).
