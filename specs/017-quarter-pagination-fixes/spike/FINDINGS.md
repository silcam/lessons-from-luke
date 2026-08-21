# Spike Findings: 017 Quarter Pagination and Coloring-Page Style Fixes

Answers to the 8 gates in the F1 spike task (`lessons-from-luke-ipuf.5.3`), settled
before any US1/US2/US3 implementation task starts. Every ODF structural claim below
was read with `xml.etree.ElementTree` (see `inspect_p_style.py`), never a regex.

## Environment note (load-bearing for every later gate)

The documented sandbox hang from `research.md` ("headless `soffice` does not run to
completion inside the planning agent's sandbox... wedged past a 5-minute budget") was
reproduced and root-caused in this session, on this same machine:

- Root cause: on macOS, `soffice --headless` still starts the Aqua VCL backend,
  which spins up a real `NSApplication` whose run loop must be pumped by a genuinely
  foregrounded, TTY-attached process. Every invocation issued through the Claude Code
  Bash tool wedges at ~0% CPU inside `Application::Yield`, forever.
- Fix: `export SAL_USE_VCLPLUGIN=svp` forces LibreOffice's headless/"screenless"
  backend instead of Aqua, which needs no windowing subsystem and no run-loop pump.
  Confirmed working for both plain `--convert-to pdf` conversions and for the
  `macro:///Standard.Module1.Assemble` UNO macro path the production pipeline and the
  007 spike both use. `specs/017-quarter-pagination-fixes/spike/assemble-files.sh`
  sets it automatically (safe on Linux too -- `svp` is also the production headless
  backend there).
- Residual limitation: a real 14-constituent merge of the full
  `Luke-2-{14..26,99}v01` corpus (Gate 5) did not complete within this session's
  available wall-clock budget (attempted up to ~10 minutes). The 2-constituent
  Gate-1 merge (below) completed in seconds with the identical script and mechanism.
  Recorded as a scoped NEEDS OPERATOR / follow-up-session item for Gate 5.

## Gate 1 (research R2) -- coloring-page fix direction (a) or (b)

Answer: hit the "hypothesis dead" branch of the task's own decision rule, with a
resulting recommendation for a modified direction (a). Working direction, not yet
corroborated against the full production pipeline -- see caveat below.

Ran the discriminating check quickstart.md Section 1 specifies: merged
`Luke-1-05v03.odt` (whose `P5` anchors a coloring-page graphic) then
`Luke-1-04v03.odt` (whose `P5` is the second memory-verse paragraph) via
`insertDocumentFromURL`, using a generalized version of the 007 spike's
`assemble.sh` that takes an explicit file list
(`specs/017-quarter-pagination-fixes/spike/assemble-files.sh`, reusing 007's
unmodified `Module1.xba`, which already reads `SPIKE_FILES` as a newline-separated
path list). Inspected the merged `content.xml` with
`specs/017-quarter-pagination-fixes/spike/inspect_p_style.py` (ElementTree, walks
every element for `text:style-name`/`text:cond-style-name`/`draw:style-name`/
`draw:text-style-name` references, not just paragraphs).

Result: `P5` was renamed, not collided. Standalone, each file's `P5` had the
colliding-but-incompatible meaning research.md predicted: `Luke-1-05v03.odt`'s `P5`
parents `Coloring_20_page_20_-_20_graphic`; `Luke-1-04v03.odt`'s `P5` parents
`Coloring_20_Page_20_-_20_Memory_20_Verse` and is referenced by the verse text "Luke
2:52 And Jesus grew...". In the merged document, LibreOffice assigned each
constituent's colliding automatic styles new, non-colliding names -- `Luke-1-05`'s
graphic-anchor style became `P12`/`P32` (two coloring pages in that fixture), and
`Luke-1-04`'s memory-verse style became `P13`/`P33` -- and each renamed style kept
its own correct `parent-style-name` and its own correct paragraph references (the
"Luke 2:52..." text stayed pointed at the style parenting the memory-verse named
style, not the graphic one). No cross-contamination occurred in this 2-constituent
merge.

Per quickstart.md's own explicit branching rule: "lesson 04's automatic styles
renamed on insert -> hypothesis dead; widen the spike." That is exactly what
happened here, at the raw `insertDocumentFromURL` layer.

Widening the spike (code-confirmed, not re-tested empirically this session):
`prepareConstituentForAssembly.ts`'s own doc comment states the production
mechanism precisely, and it is a different one from automatic-paragraph-style
renaming: "LibreOffice's `insertDocumentFromURL` display-name dedupe collapses
all 14 constituents' master pages into ONE clean... set... the merge dedupes by
display name, first definition wins, regardless of content." That describes named
styles (master pages, and by the same UNO mechanism, any other named style family
member -- including the named style `Coloring_20_Page_20_-_20_Memory_20_Verse`
itself) -- a different code path from the automatic (`Pxx`) styles this gate's
discriminating check exercised, which were directly observed to get renamed, not
deduped.

Conclusion for FR-012/FR-013/FR-014 direction: the automatic-style name collision
hypothesis, as originally stated (direction (a)'s literal premise -- prevent
automatic-style names from colliding across constituents), does not describe a real
defect at the raw-merge layer: LibreOffice already prevents that collision by
renaming. The likelier defect surface, given the codebase's own documented
dedupe-by-name behavior for named styles, is the named memory-verse/graphic parent
styles and/or the `loadStylesFromURL` `OverwriteStyles=True` template-application
pass -- neither of which this 2-constituent raw-merge check exercises.

Recommendation, to be corroborated against a real coloring-page reproduction through
the full production pipeline before US2 work starts: implement the fix as a
modified direction (a) -- in `prepareConstituentForAssembly`, flatten the second
(automatic-style-dependent) memory-verse paragraph onto the named memory-verse style
directly, matching how the first copy already names it directly. This sidesteps
automatic-style fragility entirely regardless of which merge layer (raw insert vs.
named-style dedupe vs. template overwrite) turns out to be the actual defect's
mechanism, satisfies Principle VII (fixes the whole class, not one symptom), and
does not depend on the now-falsified "automatic styles collide by name" assumption.
US2's first task should re-run this gate's discriminating check against a genuine
coloring-page constituent pair processed through the real
`prepareConstituentForAssembly` + `sofficeAssemble` + `loadStylesFromURL` pipeline
(not the raw spike merge) before committing code, since that pipeline was not
reachable in this session (see Gate 5 note on the 14-file hang, and the
DB/migration blocker below).

## Gate 2 (research R3) -- deploy-host tooling (pdftotext/pdfinfo/soffice version)

NEEDS OPERATOR. No deploy-host shell access from this environment. Locally (macOS
dev machine, not representative of the Linux deploy host): `soffice` 25.8.3.2,
`pdftotext`/`pdfinfo` present (Homebrew poppler). This says nothing about the
production box's versions -- an operator with deploy-host shell access must run
`soffice --version`, `pdftotext -v`, `pdfinfo -v` there before FR-010's task closes.

## Gate 3 (research R3/R4) -- headless vs. interactive PDF export equivalence

NEEDS OPERATOR for the interactive half. No GUI session available to drive
LibreOffice's File -> Export as PDF dialog from this environment. The headless side
is now runnable (see the `SAL_USE_VCLPLUGIN=svp` fix above); a human must still:

1. Open the assembled `.odt` (e.g. `spike/out/gate1-p5.odt`, or a full assembled
   quarter once Gate 5's blocker is resolved) in the LibreOffice GUI.
2. File -> Export as PDF, with "Export automatically inserted blank pages" checked
   (quickstart.md Section 3).
3. Compare against `soffice --headless --convert-to pdf` output (with
   `IsSkipEmptyPages=false` in the filter argument) on page count and per-page
   `pdftotext -layout` footer tokens.
4. Record agreement/disagreement here.

## Gate 4 -- do two consecutive First_20_Page pages with an explicit

style:page-number="1" restart behave as intended?

Not reached this session -- deferred behind Gate 5's blocker (a filler-page
round-trip test needs a working multi-constituent assembled book to patch and
re-render). NEEDS OPERATOR or a follow-up session with more wall-clock budget than
this one had. Per the task's own fallback: pin Standard as the master if
First_20_Page misbehaves (contract Section 2.5).

## Gate 5 (research R5) -- golden-corpus parity (lesson 1's physical page, odd/even)

Attempted, not completed. Assembling the full `Luke-2-{14..26,99}v01` corpus (14
files) with the now-working `assemble-files.sh` (the same script and mechanism that
completed the 2-file Gate-1 merge in seconds) did not finish within ~10 minutes of
wall-clock budget in this session -- no `Sub Assemble` log line ever appeared,
indicating the hang recurred somewhere before/at the start of the macro invocation
at this larger file count/size, distinct from (and not yet root-caused the same way
as) the Aqua-run-loop hang the `svp` fix resolved for the 2-file case. Also blocked:
the real production integration test (`assembleQuarter.integration.test.ts`,
`yarn test:integration`) -- which would answer this gate against the actual pipeline
rather than the raw spike merge -- could not run because the local test DB's
migration state file (`.migrate-test`) references a migration
(`1784766630015-addUniqueActiveLanguageNameIndex.js`) not present in this branch's
`migrations/` directory (an unrelated, pre-existing local-environment issue, not
introduced by this spike; resetting `.migrate-test` per `CLAUDE.md`'s documented
recovery step did not resolve it further within budget).

NEEDS OPERATOR or a follow-up session with either (a) more wall-clock budget to
root-cause the 14-file hang the same way the 2-file hang was root-caused (most
likely candidate: one or more of the real Luke-2 lesson files is large enough --
embedded images -- that a per-file `insertDocumentFromURL` step takes long enough to
look "hung" at the 5-10 minute mark; 007's own FINDINGS.md recorded 14 files taking
"~30-40s" in an interactive GUI session, a different code path timing-wise from the
`svp` headless backend used here), or (b) a working local test DB so the real
integration test's own golden-corpus assertions can answer this gate directly and
durably (preferred -- it exercises the real pipeline, not the raw spike merge).
**US3 tasks are blocked on this answer and must not proceed until it is recorded**
per the task's acceptance criterion; this spike could not produce it in the
available session.

## Gate 6 -- footer page-classification signatures (contract Section 3), both modes

Partial / deferred. Bilingual-mode static structure was confirmed via research.md's
own R1 table (master-page/footer/page-number-field matrix, [static-confirmed]
against the committed assets' `styles.xml`). Confirming the signatures against real
rendered `pdftotext` output (both bilingual and monolingual, and specifically
whether coloring-page and content-page "Quarter Q Lesson N" runs collapse to
byte-identical strings) requires a completed render, which Gate 5's blocker
prevented this session. No monolingual multi-lesson fixture corpus was found under
`test/docs/serverDocs` to build a monolingual golden batch from in any case -- this
is a fixture gap, not an operator gap: if a monolingual assembly needs verifying,
fixtures for it must be sourced or the bilingual assets' constituents adapted first.

## Gate 7 (research R1, contract Section 2.2) -- front-matter anchor decision

Not reached this session -- same blocker as Gates 4 and 6 (needs a completed render
of an assembled book to check whether physical page 2 prints "ii" and the roman
sequence is continuous). Per the task's own fallback: if either check fails, add the
explicit front-matter anchor under the same clone-and-repoint discipline as the body
restart (contract Section 2.2). NEEDS OPERATOR or follow-up session.

## Gate 8 -- render MemAvailable measurement

Not reached this session -- same blocker (needs a completed ~100-page render to
sample memory during). NEEDS OPERATOR or follow-up session; `vm_stat` is the
macOS-equivalent sampling command referenced by `assemblyBudget.ts`'s own
doc-comment procedure, for whoever completes this gate.

## Consolidated status

| Gate                                 | Status                                                                                                                         | Blocks                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1 (R2 direction)                     | Answered -- raw-merge collision hypothesis falsified; modified direction (a) recommended, pending pipeline-level corroboration | US2 (US2-T1 should re-verify against the real pipeline before implementation) |
| 2 (deploy-host tooling)              | NEEDS OPERATOR                                                                                                                 | FR-010 task                                                                   |
| 3 (headless/interactive equivalence) | NEEDS OPERATOR (interactive half); headless half now unblocked by the svp fix                                                  | Verification strategy for SC-001..SC-007                                      |
| 4 (First_20_Page restart round-trip) | NEEDS OPERATOR / follow-up session                                                                                             | R3 filler-page design                                                         |
| 5 (golden-corpus parity)             | Not answered -- attempted, blocked by an unresolved 14-file render hang and an unrelated local DB/migration issue              | US3 -- hard blocker, must be resolved before US3 starts                       |
| 6 (footer signature table)           | Partial (static half only)                                                                                                     | FR-016 test assertions                                                        |
| 7 (front-matter anchor)              | NEEDS OPERATOR / follow-up session                                                                                             | R1 implementation detail                                                      |
| 8 (MemAvailable budget)              | NEEDS OPERATOR / follow-up session                                                                                             | ASSEMBLY_MIN_AVAILABLE_BYTES tuning                                           |

## Reusable artifacts produced by this spike

- `specs/017-quarter-pagination-fixes/spike/assemble-files.sh` -- generalizes 007's
  `assemble.sh` to an explicit file list; sets `SAL_USE_VCLPLUGIN=svp`, the single
  highest-value finding of this session (unblocks every future headless `soffice`
  invocation from this harness, on this machine).
- `specs/017-quarter-pagination-fixes/spike/inspect_p_style.py` -- ElementTree-based
  (never regex) automatic-style definition/reference inspector for any `.odt`.
- `specs/017-quarter-pagination-fixes/spike/macro-template/` -- copy of 007's
  `Module1.xba`/`script.xlb`, reused verbatim.
- `spike/out/` (gitignored, not committed -- regenerate on demand) -- the completed
  Gate-1 merge output lived here as evidence during this session; reproduce with
  `./assemble-files.sh out/gate1-p5.odt <Luke-1-05v03.odt path> <Luke-1-04v03.odt path>`.
