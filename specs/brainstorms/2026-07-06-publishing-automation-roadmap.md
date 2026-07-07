---
date: 2026-07-06
topic: publishing-automation-roadmap
---

# Publishing Automation Roadmap (auth landing + final-document-assembly program)

> **Audience.** This document is written for future development sessions run by a junior
> developer and/or Claude Opus-class agents, without assuming access to this session's
> context. Every load-bearing claim below was verified against the codebase on
> **2026-07-06** (master tip `3187609`) and carries a `file:line` or git reference so it
> can be re-verified cheaply. **Re-verify before relying on anything here** — especially
> after the auth branches land, which will move many files.

## How to Use This Document

- This is a **roadmap brainstorm**, not a single-feature requirements doc. It sequences
  several workstreams. Each workstream that becomes a feature MUST go through the normal
  pipeline: `/sp:01-brainstorm` (using the seed sections below) → `/sp:02-specify` →
  … → `/sp:08-harden`. Do not implement directly from this document.
- Required background reading, in order:
  1. `CLAUDE.md` (repo root) — architecture, environments, commands, pre-commit gates.
  2. `.specify/memory/constitution.md` — non-negotiable principles (TDD, strict TS,
     layered architecture, Persistence interface).
  3. `specs/translation-publishing-sop.md` — **the domain source of truth** for this
     roadmap: Chris Jackson's complete manual publishing workflow (SOP), including the
     automation wishlist in its §30. Copied into the repo on 2026-07-06 so it survives
     handoff; the original lived outside the repo in `~/Downloads`.
  4. `specs/readme.md` — the spec index ("the Pin"); scan before creating new specs.
  5. `specs/codebase-summary.md` and `specs/glossary.md` — orientation and terminology.
- When a workstream below says "seed requirements," those are starting points for the
  eventual brainstorm/spec, phrased in the house RFC-2119 style. They are believed
  correct but are **not** yet red-teamed.

## Problem Frame

The platform produces individual translated LibreOffice `.odt` lesson files, but the
deliverable users actually need is a complete **quarter book**: one Table of Contents
plus thirteen lessons, assembled into a single editable `.odt`, manually corrected, and
exported as print-ready PDFs (A4 sequential + A3 imposed booklet) with separately
prepared color covers. Today the entire assembly path is manual: the operator downloads
14 files, drags them into a LibreOffice `.odm` master document in reverse order, exports
to `.odt`, unprotects and detaches sections, fixes footers/properties/labels by hand,
exports PDFs, and imposes/compresses them with desktop tools
(`specs/translation-publishing-sop.md` §5, §13–§23). This is slow, error-prone, requires
LibreOffice expertise, and bottlenecks publication on one person's tacit knowledge.

Separately, four code-complete authentication branches (003–006) are parked unmerged,
and the repo carries stale infrastructure (the dev Docker environment is no longer used)
plus a small uncommitted storage-factory refactor in the working tree. These must land
first: they churn shared files and the assembly work should build on a settled master.

The SOP's §30 ("Developer / Automation Notes") is the product backlog for this roadmap.
One item is already done: the "Standard" → "Bilingual" download-link rename (SOP §30.4)
shipped in PR #126, commit `0562f20`. The rest — assembled-quarter download, covers in
the platform, auto-populated verse references, project locking/archival — remain.

## Verified Current State (2026-07-06)

### Document pipeline (what already exists)

- Per-lesson translated ODT generation is complete and reusable:
  `GET /api/languages/:languageId/lessons/:lessonId/document?majorityLanguageId=<n>`
  (`src/server/controllers/documentsController.ts:16-31`) →
  `makeLessonFile(storage, lesson, motherLang, majorityLangId)`
  (`src/server/actions/makeLessonFile.ts:8-39`) → xpath-based string substitution into
  the English master ODT via `mergeXml` (`src/server/xml/mergeXml.ts:11-38`).
- **Bilingual vs monolingual** is a single switch: `majorityLanguageId=0` selects
  single-language output, which runs `singleLanguageize`
  (`src/core/models/DocString.ts:35-51`) and passes `clearEmptyParagraphs: true` to
  `mergeXml`. The web buttons live in
  `src/frontend/web/languages/LanguageView.tsx:103-119`.
- **The TOC is modeled as lesson number 99**: `TOC_LESSON = 99` and `isTOCLesson()` in
  `src/core/models/Lesson.ts:8-9,47-49`. A quarter (`Lesson.series`) = 13 lessons + the
  99-lesson TOC. Output naming (`documentName`, `Lesson.ts:30-35`) already produces
  `${lang}_${book}-Q${series}-…` filenames.
- XML is manipulated with **libxmljs2 `^0.37.0`** (the only XML library); ODT zip/unzip
  is **shell `zip`/`unzip`** via `src/core/util/fsUtils.ts:19-27` (no JSZip/archiver).
- **LibreOffice headless already runs in production.** `webifyLesson`
  (`src/server/actions/webifyLesson.ts:8-33`) shells out to
  `soffice --headless --convert-to htm:HTML` on every English upload and in the
  `generate-previews` task; production is a Capistrano/Passenger VM
  (`config/deploy/production.rb`, host `lukeproduction`), where webify demonstrably
  works — so `soffice` is installed there. PDF conversion is the same binary with
  `--convert-to pdf`.
- **No multi-ODT merge logic exists anywhere.** Nothing combines two or more ODTs; no
  master-document, style-merge, `Pictures/` merge, or manifest-rebuild code.
- File layout is env-scoped by `docStorage` (`src/server/storage/docStorage.ts`):
  ODT roots `docs/` (prod) / `docs/dev/` (dev) / `test/docs/serverDocs/` (test);
  `tmpFilePath` timestamps outputs and auto-cleans files older than 24 h.
- Web previews: `src/server/tasks/generateAllWebPreviews.ts` loops all lessons through
  `webifyLesson`; HTML lands in `<docs>/web/` and is served under `/webified/`.

### ODT internals (facts a merge implementation must respect)

Confirmed by inspecting the sample masters in `test/docs/serverDocs/` (e.g.
`Luke-1-01v01.odt`, TOC `Luke-1-99v01.odt`):

- Automatic style names (`P1…`, `T1…`) are **per-document and collide across all 14
  docs**; a pure-XML merge must rename them per lesson and rewrite every
  `text:style-name`/`table:style-name` reference.
- Master pages (`First_20_Page`, `Lesson_20_Content`, `Coloring_20_Page`,
  `Front_20_matter`, `Inside_20_cover`) collide by name but are _not identical_ across
  lessons. First-page page-number suppression is a master-page property (the
  `First_20_Page` footer simply has no `text:page-number` field).
- Footers resolve `<text:user-defined text:name="Quarter"/"Lesson">` against
  `meta.xml` user-defined properties — one value per document. A single merged document
  can hold only **one** `Lesson` value, so per-lesson footers must become literals or
  per-section fields. (The SOP's mention of a custom "Number" property corresponds to
  these `Quarter`/`Lesson` user-defined fields, plus a stray `Quarter #` field in
  `Front_20_matter`.)
- Continuous page numbering across lessons is exactly what the manual `.odm` step
  provides today; standalone lesson ODTs each restart numbering.
- Images in `Pictures/` use content-hash filenames — natural dedup, near-zero collision
  risk. `META-INF/manifest.xml` must be regenerated as the union.
- The yellow "mother tongue" highlight is `fo:background-color="#ffffcc"` on the
  `M.T.*` paragraph-style family in `styles.xml`; `src/server/xml/parse.ts:29-45`
  already enumerates these style names (including cover/front-matter title styles).
- Known sharp edges in existing code: `cleanOpenDocXml` (`mergeXml.ts:116-123`) does a
  **global** `'` → `&apos;` replacement over the whole serialized document;
  `fsUtils.zip` runs `zip -r ./*`, which does not store `mimetype` first/uncompressed
  as the ODF spec requires (LibreOffice tolerates it today); `soffice` invocation in
  `webifyLesson` is fire-and-forget with polling file-moves
  (`docStorage.mvWebifiedHtml`, `docStorage.ts:92-102`) — too race-prone to copy
  verbatim for a request-driven feature.

### Auth branches (code-complete, unmerged)

All four contain the merged 001-better-auth-migration and 002-invitation-system work in
their ancestry. `git merge-tree` against current master is clean for each **first**
merge; subsequent merges will conflict on shared hotspots
(`src/core/i18n/locales/en.ts`, `src/core/interfaces/Api.ts`,
`src/frontend/web/MainRouter.tsx`, and for 005/006 also `src/server/auth/auth.ts`).

| Branch                        | Purpose                                                                           | Base                 | PR               | Status                                                                |
| ----------------------------- | --------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------------------- |
| 003-web-auth-gate             | Default-deny `AuthGate` on all web routes; return-to deep links                   | master               | #102 (draft)     | code-complete, 13/14 beads tasks closed                               |
| 004-desktop-auth-pairing      | RFC 8628 device-grant pairing for Electron; `/api/*` auth behind default-off flag | **003** (true stack) | #117 (draft)     | code-complete, largest diff                                           |
| 005-transactional-email-reset | `EmailTransport` (Mailgun prod / log dev/test); password reset + invitation email | master               | #124 (**ready**) | code-complete, most merge-ready                                       |
| 006-user-account-management   | Admin Roster: roles, deactivate/reactivate, force sign-out                        | master               | **none**         | code-complete; local `8158b7e` is 1 commit ahead of origin (unpushed) |

Note: the `003→004→005→006` numbering does **not** describe a linear stack. Only
003→004 is stacked; 005 and 006 branch independently from master.

### Stale infrastructure

The dev Docker environment (**`Dockerfile`, `docker-compose.yml`, entrypoint scripts,
and the Docker sections of `CLAUDE.md`**) is no longer used — development and tests run
natively on-host against Homebrew Postgres. Confirmed by the maintainer on 2026-07-06.

## Roadmap

Ordering rationale: execute the flagship assembly program, then the smaller SOP
§30 items. Workstreams 2–5 are independent of each other except where noted, but
WS-2 is the priority.

### Workstream 1 — Housekeeping _(good first tasks for a junior dev / Opus session)_

- **Remove the Docker dev environment**: delete `Dockerfile`, `docker-compose.yml`,
  container entrypoint/setup scripts, and any Docker-referencing CI steps; rewrite the
  Docker sections of `CLAUDE.md` to describe the native on-host setup (Homebrew
  Postgres 16 on the Unix socket, `yarn migrate:test` gotchas). Grep the repo
  (`docker`, `compose`, `/workspace`) to catch stragglers in docs and scripts.

### Workstream 2 — Assembled quarter download _(flagship; SOP §30.1)_

**Goal.** One click on a language page downloads a complete quarter — TOC + 13 lessons —
as a single, self-contained, **editable** `.odt` (and, in a later phase, a PDF), with
sections unprotected and unlinked, continuous page numbering, first-page number
suppression per lesson, and correct footers. This replaces SOP §13–§15 (the `.odm`
assembly, export, unlock, detach steps) while explicitly preserving the human visual-QA
pass (SOP §30.8 — automation must produce an editable document, not just a PDF).

**Key decision (CONFIRMED by WS-2a spike — GO): assemble with LibreOffice headless,
not a pure-XML merge.** Three approaches were assessed against the actual sample ODTs;
the spike (`specs/007-assembled-quarter-download/spike/FINDINGS.md`) then proved the
A-path end-to-end on the real Luke series-2 masters.

- **A. LibreOffice-driven assembly (chosen — spike CONFIRMED).** Generate the 14
  translated ODTs with the existing `makeLessonFile`, then have `soffice --headless`
  combine them via UNO `insertDocumentFromURL` (Basic-macro-driven in-process; the
  `.odm` route was not needed). **Spike result:** one fully-editable `.odt`, **zero
  protected/linked sections** (SOP §15 unlock unnecessary), **continuous numbering**,
  **per-lesson first-page suppression**, and **all image references preserved** (physical
  images deduped by LO). The A-path's "field resolution" claim proved **only partly**
  true: the per-lesson footer **Quarter/Lesson number fields go blank** after merge —
  exactly the "single `meta.xml` limitation" flagged under approach B below.
  `insertDocumentFromURL` does not carry over `meta.xml` custom properties, so those
  `text:user-defined` footer fields lose their backing values. **Fix (planning must
  budget it):** flatten each lesson's footer fields to literal text before insertion.
  A second planning-level gap surfaced in manual review: **pagination is not yet
  book-correct** — continuous but with a +1 offset, and lessons don't start on
  odd/right-hand pages (source masters are `page-usage="all"`). Fix: set the lesson
  first-page master to `style:page-usage="right"` (`PrintEmptyPages` already true),
  which reserves blank versos and starts lessons on odd pages. A manual page break
  between constituents is also required (78 vs 91 pages without it).
  Risks confirmed real: new UNO/macro surface; **`soffice` is effectively single-
  instance** (serialize the assembly step or use isolated per-job
  `-env:UserInstallation` profiles — the spike hit hangs from concurrent instances);
  `NODE_ENV=test` stubs soffice out, so an integration-test strategy is required
  (constitution Principle I routes external-binary surfaces through
  `*.integration.test.ts`). Also note (macOS-only, non-blocking for the Linux server):
  LO's bundled Python is `SIGKILL`ed locally, so local tooling must drive UNO via Basic.
- **B. Pure-XML N-way merge in Node (rejected as primary).** Deterministic and
  test-friendly, but must hand-solve guaranteed `P*/T*` automatic-style collisions
  across 14 docs, master-page dedup, per-lesson footer fields (single `meta.xml`
  limitation), and continuous numbering — the highest-effort, highest-risk path, and
  PDF still needs LibreOffice anyway.
- **C. Hybrid (fallback).** Coarse XML concatenation in Node, then one `soffice`
  normalize/convert pass. Keep in reserve if A's macro surface proves unworkable.

**Suggested phasing** (each phase is a separately shippable `/sp:` feature):

- **2a. Assembly spike (timeboxed research, before specify) — DONE, GO.** Proved the
  A-path end-to-end on the English masters in `test/docs/serverDocs/`. Note: **Luke
  series 1 is incomplete (missing lesson 06 — only 12 lessons)**, so the spike used
  **series 2** (`Luke-2-99v01.odt` TOC + lessons 14–26 = 14 files); series 3 and 4 are
  also complete quarters. Verified continuous numbering, first-page suppression, image
  survival, and unprotected/unlinked sections; footer per-lesson _title_ correct but the
  Quarter/Lesson _number_ fields need a flatten step (see Key decision A). Deliverables:
  `specs/007-assembled-quarter-download/spike/` (`assemble.sh`, `verify.sh`, the macro,
  `FINDINGS.md`, and a sample assembled `.odt` + PDF).
- **2b. Server endpoint + UI.** `GET /api/languages/:languageId/quarters/:series/document?majorityLanguageId=<n>`
  mirroring `documentsController`; loops the quarter's lessons + TOC through
  `makeLessonFile`, assembles via the 2a mechanism, streams the result. Frontend: a
  per-quarter download control beside the existing per-lesson links
  (`LanguageView.tsx`), reusing the `useGetDocument` blob/save pattern. Long-running:
  assembly of 14 docs + soffice will exceed comfortable request time — plan for an
  async job + polling or a generous timeout; decide in planning.
- **2c. PDF output.** Same endpoint with `format=pdf` via `soffice --convert-to pdf`.
  Out of scope for automation (leave manual per SOP): A3 imposition and PDF
  compression — desktop-tool territory (Cheap Imposter, PDF Shrink) unless a later
  workstream adopts a Node imposition library.

**Seed requirements** (for the eventual `/sp:01-brainstorm`):

- R1. The system **MUST** produce a single self-contained `.odt` per (language,
  book, quarter, output-type) containing the TOC followed by lessons 1–13 in order.
- R2. The output **MUST** be fully editable: no protected sections, no external links
  (SOP §15 becomes obsolete for assembled output).
- R3. Page numbering **MUST** run continuously across lessons; each lesson's first page
  **MUST** suppress its page number (matching current `.odm`-produced output).
- R4. Both bilingual (`majorityLanguageId=<ref>`) and monolingual
  (`majorityLanguageId=0`) assembly **MUST** be supported, reusing `makeLessonFile`
  semantics unchanged.
- R5. The assembled document **MUST NOT** be produced if any of the 14 constituent
  documents fails generation; partial books are worse than errors.
- R6. `soffice` invocations **MUST** use an isolated user profile per job and surface
  errors to the caller (no fire-and-forget).
- R7. External-binary behavior **MUST** be covered by integration tests
  (`*.integration.test.ts`) runnable on a host with LibreOffice installed; unit tests
  **MUST NOT** require `soffice`.
- R8. Domain data access **MUST** go through the `Persistence` interface; the feature
  is server-only and **MUST NOT** touch `core`'s platform-agnosticism or desktop.

### Workstream 3 — Covers in the platform _(SOP §30.2)_

Bring the A4/A3 cover `.odt` files into the platform the way the TOC was brought in, so
cover text auto-populates from already-translated strings and TOC metadata instead of
manual copy/paste (SOP §22). Grounding: the parse machinery already recognizes cover
style names (`M.T._20_Cover_20_title`, `M.T._20_Cover_20_subtitle`,
`M.T._20_Front_20_matter_20_Title` — `src/server/xml/parse.ts:32-43`), so this is
plausibly "TOC pattern, again": reserve a special lesson number (or a new document
kind) for covers, upload English cover masters, translate/populate via existing
tStrings, download via `makeLessonFile`. Decide in specify: special-lesson-number hack
(cheap, consistent with TOC=99) vs. a proper document-kind model (cleaner, more
schema). Depends on nothing; pairs naturally after WS-2b so the quarter package can
eventually bundle covers.

### Workstream 4 — Auto-populate verse-reference strings _(SOP §30.3)_

At project creation, auto-fill isolated verse-reference number strings the way picture
numbers are already auto-created (SOP §10.5–§10.6), keeping them editable. Requires
locating the existing picture-number automation in the codebase (not mapped in this
session — start by grepping project-creation paths in the languages controller/storage
for the picture-number logic and mirror it). Small, self-contained, good early Opus
feature after WS-1.

### Workstream 5 — Project safety: locking, archival, label cleanup _(SOP §30.4–§30.5)_

- Lock completed/reference projects and protect source projects from edits that destroy
  downstream translation history (SOP §6.2's "treat as locked" rule, enforced in
  software). This is the highest _risk-reduction_ item in the SOP — a single careless
  source-string edit can silently destroy other languages' work.
- Archive/delete abandoned projects.
- Remaining label work: "mother tongue" → "bilingual" project-mode terminology
  (the "Standard" → "Bilingual" download-link half already shipped in PR #126).

Straightforward CRUD + UI work; needs product decisions on who can lock/unlock (ties
into 006's role model — schedule after WS-0).

## Sequencing Summary

```
WS-0 (auth merges: 005 → 003 → 004 → 006)
  └─ WS-1 (housekeeping: commit makeStorage, remove Docker)
       ├─ WS-2a spike ─ WS-2b quarter ODT ─ WS-2c PDF     ← priority path
       ├─ WS-4 verse refs                                  ← parallel-safe
       ├─ WS-3 covers                                      ← after 2b ideally
       └─ WS-5 locking/labels                              ← needs 006's roles
```

## Guidance for Future (Opus) Sessions

- **Work the pipeline, not the vibes.** Every feature here goes through
  `/sp:02-specify` → `/sp:08-harden` with beads (`br`) tracking. `/sp:next` tells you
  where you are. Phase artifacts land in `specs/<NNN-slug>/`.
- **TDD is constitutional** (Principle I): tests first, 95% coverage enforced,
  `soffice`-touching code goes in `*.integration.test.ts`, never bypass pre-commit.
- **Verify, don't trust.** File/line references in this doc were accurate on
  2026-07-06 and will drift, especially after WS-0. Re-grep before editing.
- **Spike before specify on WS-2.** The LibreOffice-assembly decision rests on a
  feasibility assessment, not a working prototype. Run the 2a spike first; if `soffice`
  scripting proves unreliable, fall back to approach C and update this document's Key
  Decisions.
- **Respect the domain red lines** from the SOP: never edit original source-language
  projects (translation links/history can be destroyed — SOP §6.2, §28.3); never
  "normalize" Paratext-imported Scripture text (SOP §8.6); automation must always leave
  an editable ODT for human QA (SOP §30.8).
- **Known code sharp edges** to plan around, not stumble into: the global
  `'`→`&apos;` replace in `cleanOpenDocXml`; non-spec `zip -r` mimetype ordering in
  `fsUtils.zip`; xpath-keyed strings in `parse.ts`/`mergeXml.ts` are positional and
  brittle to structural document edits; `webifyLesson`'s polling file-move is not a
  pattern to copy.
- **Conserve context**: fan work out to subagents (per `CLAUDE.md`), keep the main
  session for synthesis and decisions.

## Scope Boundaries

- No automation of A3 imposition or PDF compression (desktop tools remain, SOP §21/§23).
- No changes to the translation interface or the per-lesson download endpoints.
- No Google Drive integration; file organization (SOP §12, §26) stays manual.
- No re-import of externally edited documents (SOP §30.6 — open question, not scoped).
- No desktop (Electron) changes in any workstream except WS-0's 004 branch landing.

## Outstanding Questions

### Resolve Before Specify (WS-2)

- Does the 2a spike confirm `soffice`-driven assembly preserves numbering, footers, and
  editability? (Blocking; everything in WS-2 hangs on it.)
- Sync request vs. async job for quarter assembly (14 × `makeLessonFile` + `soffice`
  runtime — measure in the spike).

### Deferred to Planning

- [Affects WS-2 R3/R6][Technical] Exact `soffice` mechanism: UNO macro vs. generated
  `.odm` + `--convert-to`; per-job profile-dir hygiene; timeout/kill policy.
- [Affects WS-2 R7][Technical] Where integration tests with a real LibreOffice run in
  CI, given the Docker environment is being removed (GitHub-hosted runners can
  `apt-get install libreoffice`; decide in planning).
- [Affects WS-3][Product] Cover modeling: special lesson number vs. first-class
  document kind; where cover masters are uploaded/stored.
- [Affects WS-5][Product] Who may lock/unlock projects; whether "archive" hides or
  hard-deletes.

## Next Steps

→ Execute WS-1 (commit `makeStorage`, remove Docker) — no new specs required.
→ Run the WS-2a assembly spike; write up findings next to this document.
→ `/sp:01-brainstorm` the WS-2 quarter-assembly feature using the seed requirements
above plus spike results, then `/sp:02-specify` on a new `007-*` branch.
