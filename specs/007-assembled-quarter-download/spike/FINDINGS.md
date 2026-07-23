# WS-2a Spike Findings — LibreOffice-headless quarter assembly

**Beads:** `lessons-from-luke-koog.1` · **Feature:** `007-assembled-quarter-download`
**Date:** 2026-07-06 · **Machine:** macOS (Darwin 24.6), LibreOffice 25.8.3.2 (`/opt/homebrew/bin/soffice`)

## Verdict: **GO** ✅ — with one documented, fixable gap (Q4 footer _numbers_)

LibreOffice headless can merge a TOC + 13 lesson ODTs into **one fully-editable
`.odt`** with **per-lesson first-page number suppression** and **per-lesson footers**
— with **no protected sections and no external/linked content**. SOP §15's manual
unlock/detach step is **not needed**. The assembly _mechanism_ is proven; two
**page-layout policy** items remain for planning (neither is a feasibility blocker):

- **Q2 numbering (PARTIAL):** numbering is continuous (no per-lesson restart) but
  carries a **global +1 offset** (lesson 1 prints page 5, not 4), and lessons do **not**
  yet start on **odd/right-hand pages** as a printed book should. Both resolve with one
  scoped page-style change — set the lesson first-page master to `page-usage="right"`.
  See "Pagination" below.
- **Q4 footers (PARTIAL):** footer _titles_ carry over correctly per-lesson, but the
  **Quarter/Lesson number fields render blank** (document custom properties that
  `insertDocumentFromURL` drops). Confirmed cause + scriptable fix in Q4 + caveat 5.

Per the plan's GO bar ("1, 5, 6 solid and a credible, scriptable path to 2, 3, 4"):
Q1/Q5/Q6 are solid, Q3 passes, and Q2/Q4 each have a confirmed cause and a concrete
scriptable fix direction — so this is a **GO**, but **planning must budget the
`page-usage="right"` pagination work and the footer field-flattening**.

**Still pending (plan's authoritative manual check):** a human GUI eyeball of
`out/Luke-2-assembled.odt` in LibreOffice to confirm the 70 (deduped) images
actually **render** (reference count is preserved — see Q5 — but that is not the
same as confirming pixels) and that the doc is **editable** in Writer. The
objective signals below are pre-screens; sent to the user for that confirmation.

## Which mechanism won

**Approach A2 — `insertDocumentFromURL`**, driven from a **StarBasic macro
running in-process inside `soffice`** (not Python-UNO).

Rationale, from evidence gathered during the spike:

- On this macOS build, LibreOffice's **bundled Python is `SIGKILL`ed on launch**
  (exit 137) — even `--version`, and even when launched via `osascript`
  (`do shell script`), i.e. entirely outside the Claude Code sandbox. It is a
  separate hardened-runtime nested `.app` (`LibreOfficePython.app`) that will not
  run standalone here. `soffice` itself (same signed bundle, same quarantine)
  runs fine (`soffice --version` → exit 0). So **Python cannot drive UNO
  locally**, but a **Basic macro reaches the identical UNO surface**
  (`XDocumentInsertable.insertDocumentFromURL`) in-process in the binary that
  works. Pivoting to Basic is **not** abandoning A2 — it _is_ A2 via a different
  driver; the six output properties are properties of the UNO call, not the
  language.
- On the **production Linux server**, LO's bundled Python has none of this macOS
  hardened-runtime problem, so **Python-UNO remains a viable server driver** — the
  Basic macro was a local-Mac routing choice, not a mechanism change. Planning
  may pick either (Basic macro works cross-platform and is what's proven here).

Approach **C (Node concat)** was not needed. Approach **A1 (.odm master doc)** was
initially deferred here, then tested in a **sibling spike** because the `.odm` route was
believed to fix this spike's two pagination gaps (the +1 offset and odd-page starts).
It does **not** — see [`odm/FINDINGS-odm.md`](odm/FINDINGS-odm.md): A2, a scripted
`.odm`, and **Chris's actual `English_Luke-Q2-Master.odm`** (fetched from Drive, rewired
to these inputs) all render the **same +1 offset** and no odd rectos, so `.odm` buys no
pagination advantage while adding master-authoring + unproven-detach cost. **Verdict:
proceed with A2** and treat the offset as a route-independent post-assembly fix. (One
A1-only lead for the Q4 footer gap below: Chris's _protected_ linked sections preserve
per-lesson footer numbers where A2 blanks them.)

## Exact invocation that worked

Per-run, isolated user profile (proves the isolation pattern the real feature
needs; none exists in the repo today). Two phases against one fresh profile:

```bash
# Phase 1 — warm the profile so LO builds its user/basic library tree
soffice --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  --convert-to odt --outdir "$PROFILE_ROOT/warm_out" "$warm"
# then overwrite $PROFILE/user/basic/Standard/Module1.xba with the Assemble macro
# and rm -f "$PROFILE/.lock"  (warmup leaves a stale lock)

# Phase 2 — run the assembly macro (inputs via env vars SPIKE_FILES/SPIKE_OUT_URL)
soffice --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  "macro:///Standard.Module1.Assemble"
```

The macro (`macro-template/basic/Standard/Module1.xba`, `Sub Assemble`): create a
blank Writer doc; for each of the 14 files in order, `gotoEnd`, insert a
`PARAGRAPH_BREAK` + set `BreakType = PAGE_BEFORE` (for docs 2..14), then
`oCursor.insertDocumentFromURL(url, {UpdateDocMode: NO_UPDATE})`; finally
`storeToURL(..., FilterName="writer8")`. `UpdateDocMode=NO_UPDATE` avoids any
"update links?" prompt that would hang a headless process.

Driver script: `assemble.sh Luke 2 out/Luke-2-assembled.odt`. Verifier:
`verify.sh out/Luke-2-assembled.odt`.

## The six questions — observed behavior

Measured on `out/Luke-2-assembled.odt` (14 files → 91 pages, 4.1 MB) and its
verification PDF `out/Luke-2-assembled.pdf`.

| #   | Question                                             | Result     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Order** — TOC then lessons 14→26                   | ✅ PASS    | Front matter (roman `ii`,`iii`) first; footer titles then appear in lesson order: _The Twelve Apostles_ (L14) → _…Love Their Enemies_ (L15) → _…is Generous_ (L16) → … → _Review Lesson_ (L26).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | **Continuous numbering** (no per-lesson restart)     | ⚠️ PARTIAL | Numbers run continuously across the whole book (never reset per lesson) — but with a **global +1 offset**: printed number = physical page + 1 (TOC ends on iii=3, lesson 1 first page prints **5**, not 4). Confirmed via per-physical-page render dump. Cause + fix and the related **odd-page-start policy** in "Pagination" below.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 3   | **First-page suppression** per lesson                | ✅ PASS    | Each lesson's first physical page (p04, p10, p17, p24, p32, p39, p47, p52, p59, p66, p73, p80, p87) shows no page number.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | **Footers** show correct per-lesson value (no bleed) | ⚠️ PARTIAL | Footer **title** changes correctly per lesson (Twelve Apostles → … → Review Lesson), so no bleed. But the footer's **Quarter/Lesson _number_ fields render blank** (`Quarter __ Lesson __ <Title> Page N`). **Discriminator:** standalone `Luke-2-14v01.odt` → PDF shows `Quarter 2 Lesson 14 …`; assembled shows blank → assembly broke it. **Confirmed cause:** those are `<text:user-defined name="Quarter"/"Lesson">` fields backed by each ODT's `meta.xml` custom properties (L14=14, L26=26, Quarter=2); the assembled `meta.xml` is **empty** — `insertDocumentFromURL` merges body content but not per-document custom properties, and 13 lessons with different values cannot share one merged doc's single property namespace. See fix in caveat 5. |
| 5   | **Images intact**                                    | ✅ PASS    | **87 `draw:image` references in inputs = 87 in the assembled doc** — zero lost. Physical `Pictures/` dropped 92→70 purely from LibreOffice content-hash **dedup** of shared logos/decorations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 6   | **Editable / link-free**                             | ✅ PASS    | `content.xml` has **0** `text:protected="true"`, **0** linked `.odt` (`xlink:href=…​.odt`), **0** `text:section-source`. Fully embedded; SOP §15 unlock unnecessary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Pagination (Q2) — offset + odd-page-start policy (planning decision)

The assembly numbers continuously but **not book-correctly yet**. Two related items,
both **page-layout policy** that belongs in planning, not assembly-mechanism blockers:

1. **Global +1 offset (defect, root cause UNRESOLVED).** Printed number = physical page
   - 1 throughout (confirmed by a full per-physical-page render dump): lesson 1 prints
     page 5 (first page, suppressed) then 6, instead of 4/5. All page-number fields are
     `auto` (no explicit offset injected) and there is **no physical blank page** — one
     page is counted but never rendered. **Hypotheses tested and disproven:**
   * _Blank-base leading paragraph_ — removing it (extend-select the empty first
     paragraph + its pilcrow, `SPIKE_REMOVE_LEAD=1`) is **destructive** (the cover title
     lives in a frame anchored to that paragraph, so deletion drops the cover) **and does
     not change the +1 offset**. So the leading paragraph is _not_ the cause.
   * _TOC as base document_ — avoids the blank-doc paragraph but the TOC's named page
     styles win the style-name collision and **bleed the TOC footer onto every lesson**
     (wrong footers) — rejected.
     The true cause is an unresolved LibreOffice front-matter/page-counting detail that
     needs dedicated investigation in the plan/implementation phase (compare against the
     manual master-document workflow's reference output to define the target).

2. **Odd-page lesson starts (requested policy, not in source).** A real book starts each
   lesson on an odd (right-hand) page. The source lesson master pages (`First_20_Page`,
   `Lesson_20_Content`, `Standard`) are **`page-usage="all"`** — they do **not** reserve
   versos. **Prototype applied (`apply-odd-page-fix.sh`, sample `out/Luke-2-oddpage.odt`):**
   setting `style:page-usage="right"` on the lesson first-page page-layout (`Mpm2`,
   exclusive to `First_20_Page`) is a clean post-merge `styles.xml` edit that produces a
   valid ODF. **But it does not yet yield physical odd-page rectos** — because the +1
   offset (item 1) already makes each lesson's first page land on an odd page _number_,
   LibreOffice considers the "right" constraint satisfied and inserts **0 blank versos**.
   So the mechanism for odd-page starts is proven, but it is **blocked on fixing the +1
   offset first** (so page number = physical position). Order of operations for planning:
   resolve the offset, then `page-usage="right"` gives correct rectos + auto versos.

3. **Manual page break between constituents is REQUIRED.** Relying on each lesson's own
   first-page master to force the break is **not reliable** — tested: **78 pages** without
   the inserted break (lessons ran onto the previous lesson's last page) vs **91** with it.
   The macro inserts a `PARAGRAPH_BREAK` + `BreakType=PAGE_BEFORE` at each boundary by
   default (`SPIKE_MANUAL_BREAK=0` to disable).

**Net:** continuous numbering works; making it _book-correct_ (offset resolved, lessons
on odd pages) is real page-style/page-counting work for planning — the `page-usage="right"`
mechanism is proven but gated on the offset. Not a feasibility blocker for the assembly
itself.

## Caveats & residual risks (for planning)

1. **macOS: LO bundled Python is unusable locally** (SIGKILL). Local tooling must
   drive UNO via Basic macro (as here) or a socket server. On Linux prod this
   does not apply. — _Confirmed on this machine; would also fail in the user's own
   terminal (the `osascript` test is equivalent)._

2. **LibreOffice is effectively single-instance on macOS.** Launching a second
   `soffice` while another is running makes the new one hang (it forwards to the
   existing app instance). `assemble.sh` guards against this (refuses to start if
   a soffice is already up) and uses an isolated `-env:UserInstallation` profile
   per run. **Concurrency implication for the real feature:** on a server, quarter
   assembly jobs must be **serialized** (or use fully isolated instances/profiles
   with distinct pipe names). Plan for a job queue with concurrency 1 for the
   soffice step, or per-job profile isolation verified under load.

3. **Headless hang if backgrounded/detached (Claude Code harness artifact).**
   Under the Claude Code Bash tool, when the command is auto-backgrounded (or run
   via `nohup &`), the Aqua `soffice` hangs in its macOS GUI event loop
   (`Application::Yield` → `_BlockUntilNextEventMatchingListInModeWithFilter`) and
   never dispatches the `macro:///`. Run **foreground/attached** and it completes
   (~30–40 s for 14 files). This is a macOS-GUI-app + detachment interaction, **not
   present on a headless Linux server** and not a property of the mechanism. Run
   `assemble.sh` in a normal terminal.

4. **Stale profile `.lock`.** The warmup `soffice` leaves a `.lock` in the profile
   after it exits; `assemble.sh` `rm -f`s it before the macro launch. Real feature
   should manage profile lifecycle (temp profile per job, cleaned up) — **profile-
   dir hygiene** is a real housekeeping concern (disk + cleanup on crash).

5. **Footer Quarter/Lesson number fields render blank — assembly-introduced,
   fixable (this is the Q4 gap).** _Confirmed_ (not assumed): standalone
   `Luke-2-14` renders `Quarter 2 Lesson 14 …` in its footer; the assembled book
   renders `Quarter __ Lesson __ …`. The fields are `<text:user-defined
name="Quarter"/"Lesson">`, whose values live in each ODT's **`meta.xml`
   custom properties** (`Quarter=2`, `Lesson=14…26`). `insertDocumentFromURL`
   copies body content but **not** per-document custom properties, so the merged
   `meta.xml` is empty and every such field resolves to nothing. This cannot be
   fixed by setting one value on the merged doc (each lesson needs a _different_
   Lesson number in a single shared namespace).
   **Scriptable fix (for planning):** flatten each lesson's footer
   `text:user-defined` fields to **literal static text** _before_ insertion, so
   `Quarter 2 Lesson 14` becomes fixed text that survives the merge and stays
   per-lesson. Two viable routes:
   (a) **Per-ODT pre-process** — read the lesson's `meta.xml`, substitute the
   `<text:user-defined name="Quarter"/"Lesson">…</text:user-defined>` elements
   in `styles.xml` (the footer lives there) with their resolved literal
   values, re-zip, then insert. Cheap, no UNO; note the `zip -r` mimetype-
   ordering sharp edge if reusing `fsUtils.zip`.
   (b) **In-macro** — after inserting each doc, walk that lesson's page-style
   footer and replace the field ranges with literal text pulled from the
   source `meta.xml`. Keeps everything in the one soffice pass.
   Recommend route (a): it's decoupled from LO and testable in isolation. Either
   way, **budget this step in the plan** — it is the one non-trivial gap.

6. **Timeouts.** 14 files → ~30–40 s here; budget generously per quarter and set a
   hard timeout + kill in the real job runner (a hung soffice sits at 0% CPU
   forever).

7. **Not exercised in this spike:** the `zip -r` mimetype-ordering sharp edge and
   `cleanOpenDocXml` global-apos issue (`fsUtils`) are **not** on the A2 path — LO
   writes the `.odt` itself via `storeToURL`, so the repo's manual zip/xml-munging
   utilities are bypassed entirely. Only relevant if planning chooses approach C.

## Stage 2 (realism pass vs translated ODTs) — status

**Not run; not required for GO.** Rationale: translated/merged lesson ODTs carry
the **same structural surface** as the English masters (same page styles, master
pages, footers, page-number fields, image placements) — `makeLessonFile` changes
**text content**, not document structure. The spike's risk was always the
**assembly mechanism**, which is now proven on structurally-identical real inputs.

If planning wants belt-and-suspenders confirmation, the documented prerequisite
is: the chosen quarter's **14 English masters must be present under `docs/dev/`**
(`seed-dev-docs` only seeds Luke-1 lessons 01–05 today), then generate translated
constituents via `makeLessonFile` under `NODE_ENV=development` and re-run
`verify.sh` on the assembled result. Cheap, but structurally redundant with what's
already shown.

## Note on inputs

The brainstorm's "Luke-1 + 13 lessons" assumption is **wrong**: Luke **series 1 is
missing lesson 06** (only 12 lessons). The spike used **series 2** (lessons 14–26 +
`-99` TOC = 14 files), which is complete. Series 3 (27–39) and 4 (40–52) are also
complete quarters.

## Deliverables in this directory

- `assemble.sh` — driver (resolves 14 masters, warms profile, runs macro).
- `verify.sh` — objective pre-screens (link/protection grep, image-ref count,
  PDF page count + per-page footer/number extraction).
- `apply-odd-page-fix.sh` — prototype for the odd-page-start policy: patches
  `style:page-usage="right"` onto the lesson first-page page-layout in an assembled
  `.odt` and repackages valid ODF (mimetype-first, stored). See Pagination item 2.
- `macro-template/basic/Standard/Module1.xba` — the `Assemble` + `Smoke` macros.
- `out/Luke-2-assembled.odt` — sample assembled quarter (14 files).
- `out/Luke-2-assembled.pdf` — its verification PDF (open either to eyeball).
- `out/Luke-2-oddpage.odt` — the assembled quarter with the `page-usage="right"`
  prototype applied (demonstrates the mechanism; blocked on the +1 offset per above).
