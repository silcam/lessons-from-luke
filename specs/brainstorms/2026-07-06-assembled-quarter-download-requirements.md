---
date: 2026-07-06
topic: assembled-quarter-download
---

# Assembled Quarter Download (WS-2b, SOP §30.1)

> Scoped from `specs/brainstorms/2026-07-06-publishing-automation-roadmap.md`, Workstream 2.
> This document covers **only** the editable-`.odt` assembly-download feature (roadmap's
> phase 2b). PDF export (2c), A3 imposition, and covers are explicitly out of scope here —
> see Scope Boundaries.

## Problem Frame

Today, producing a complete quarter book (TOC + 13 lessons) requires the publishing
operator to download 14 separate `.odt` files from the platform and manually assemble
them in LibreOffice: build a `.odm` master document, drag files in a specific order,
export to `.odt`, then unlock/detach protected sections (SOP §13–§15). This is slow,
error-prone, and requires LibreOffice expertise the platform shouldn't assume every
operator has.

This feature automates that assembly: one action on the language/quarter page produces a
single, editable, correctly-ordered `.odt` — eliminating SOP §13–§15 — while leaving the
existing human visual-QA pass (SOP §18) untouched, since automation cannot yet fix layout
issues like overlapping images or footer irregularities.

## Requirements

**Assembly**

- R1. The system MUST produce a single self-contained `.odt` per (language, book,
  quarter) containing the TOC followed by lessons 1–13, in order.
- R2. The output MUST be fully editable: no protected sections, no external/linked
  content (this is what makes SOP §15 obsolete for assembled output).
- R3. Page numbering MUST run continuously across lessons; each lesson's first page MUST
  suppress its page number, matching current `.odm`-produced output.
- R4. Both bilingual (`majorityLanguageId=<ref>`) and monolingual (`majorityLanguageId=0`)
  modes MUST be supported, reusing existing per-lesson document-generation semantics
  unchanged — including current partial-translation fallback behavior. This feature
  introduces **no stricter translation-completeness bar** than exists today for
  single-lesson download.

**Availability and failure handling**

- R5. Assembly requires all 13 lessons + TOC to exist and generate successfully. If any
  is missing or fails to generate, the request MUST be blocked or fail with a message
  identifying which lesson(s) are missing — the system MUST NOT produce a partial book.

**Experience**

- R6. The UI MUST present a per-quarter "assemble and download" action (alongside the
  existing per-lesson download controls) that: starts a background assembly job, shows
  in-progress status, and delivers the file for download once ready. This anticipates
  assembly (14 documents + `soffice`) exceeding a comfortable synchronous request time.
- R7. Job tracking MUST be in-memory / server-process-scoped. No new persistent
  job-storage table or queue is required — if the server restarts mid-assembly, the
  operator simply re-requests. This matches the small-team, low-concurrency scale of the
  tool.

## Success Criteria

- An operator can produce a correctly ordered, continuously-numbered, fully editable
  assembled quarter `.odt` without opening LibreOffice's master-document workflow.
- SOP §13–§15 (copy `.odm`, drag-drop assembly, export, unlock/detach) become unnecessary
  for the ODT-assembly portion of the workflow.
- The assembled output is good enough that the operator's existing visual-QA pass (SOP
  §18) is the only manual step remaining before PDF export — automation introduces no
  new categories of defects.

## Scope Boundaries

- No PDF generation in this feature (roadmap phase 2c, a separate later feature).
- No A3 imposition or PDF compression (desktop tools remain, per roadmap/SOP).
- No cover assembly (roadmap Workstream 3, separate).
- No change to the existing per-lesson download endpoints or UI.
- No new translation-completeness gating policy.
- No persistent/durable job-tracking infrastructure (queue, DB-backed job table).

## Key Decisions

- **Assembly mechanism: LibreOffice headless (`soffice`), not a pure-XML merge.**
  Decided in the parent roadmap doc after inspecting sample ODTs — `soffice` natively
  resolves automatic-style collisions, master-page binding, field resolution, and
  continuous numbering, which a hand-rolled XML merge would have to solve one-by-one.
  `soffice` is already a proven production dependency (`webifyLesson`). Revisit only if
  the 2a feasibility spike (see Dependencies) shows this is unworkable.
- **Background job + polling, not a long synchronous request.** Assembling 14 documents
  through `soffice` is expected to exceed a comfortable request timeout; a progress UI is
  more resilient than a browser tab hanging on a single request.
- **Block incomplete quarters with a clear reason, rather than allowing partial
  assembly.** A silently partial book is worse than a hard stop naming what's missing.
- **No stricter translation-completeness bar than today.** "Complete" in R5 means all 13
  lesson + TOC records exist and generate without error — not that translation progress
  is 100%. Matches current per-lesson download behavior and avoids scope creep into
  progress-gating policy, which is a separate product concern.

## Dependencies / Assumptions

- Depends on the roadmap's **2a assembly spike** succeeding: proving `soffice`-driven
  assembly actually preserves continuous numbering, correct footers, image integrity, and
  editability when merging the sample masters in `test/docs/serverDocs/`. If the spike
  shows this approach is unworkable, the technical premise here (LibreOffice headless)
  must be revisited before `/sp:02-specify` proceeds.
- Assumes the existing `makeLessonFile` / `mergeXml` per-lesson generation pipeline is
  reused unchanged as the source of the 14 constituent documents.

## Outstanding Questions

### Resolve Before Specify

_(none — the product-level questions in this brainstorm were resolved in dialogue)_

### Deferred to Planning

- [Affects R6][Technical] Exact `soffice` invocation mechanism (UNO macro vs. generated
  `.odm` + `--convert-to`), per-job `-env:UserInstallation` profile-dir isolation, and
  timeout/kill policy.
- [Affects R6][Technical] Polling mechanism specifics — endpoint shape, poll interval,
  job-ID scheme — given in-memory (non-persisted) job tracking.
- [Affects R5][Technical] Where exactly "the language's set of 13 lessons + TOC" is
  looked up/validated against `Lesson.series` — confirm in codebase during planning.
- [Affects R1–R3][Needs research] Confirm via the 2a spike that `soffice`-driven assembly
  actually preserves continuous numbering, per-lesson footers, and editability as
  assumed here.

## Next Steps

→ Run the roadmap's WS-2a assembly spike (if not already done) to de-risk the LibreOffice
headless approach before specifying.
→ `/sp:02-specify` the assembled-quarter-download feature using this requirements doc
(`specs/brainstorms/2026-07-06-assembled-quarter-download-requirements.md`).
