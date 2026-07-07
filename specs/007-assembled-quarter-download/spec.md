# Feature Specification: Assembled Quarter Download

**Feature Branch**: `007-assembled-quarter-download`  
**Created**: 2026-07-06  
**Status**: Draft  
**Brainstorm**: specs/brainstorms/2026-07-06-assembled-quarter-download-requirements.md  
**Beads Epic**: `lessons-from-luke-koog`  
**Beads Phase Tasks**:

- ws-2a-spike (blocks plan): `lessons-from-luke-koog.1`
- plan: `lessons-from-luke-koog.2`
- red-team: `lessons-from-luke-koog.3`
- tasks: `lessons-from-luke-koog.4`
- analyze: `lessons-from-luke-koog.5`
- implement: `lessons-from-luke-koog.6`
- harden: `lessons-from-luke-koog.7`

**Input**: User description: "Assembled quarter download (WS-2b, SOP §30.1): one per-quarter action produces a single self-contained, fully editable document containing the Table of Contents followed by lessons 1–13 in order, with continuous page numbering and per-lesson first-page number suppression, in both bilingual and single-language modes. Runs as a background job with in-progress status and delivers the file for download when ready; blocks incomplete quarters with a clear reason. PDF export, covers, and A3 imposition are out of scope."

## Overview

Today, producing a complete quarter book requires a publishing operator to download 14 separate lesson documents (a Table of Contents plus 13 lessons) and manually assemble them in a desktop word processor: build a master document, drag the files into a specific order, export to a single document, then unlock and detach protected sections. This is slow, error-prone, and assumes desktop-publishing expertise the platform should not require.

This feature automates that assembly. From the language/quarter page, a single action produces one correctly ordered, continuously numbered, fully editable quarter document — eliminating the manual master-document, export, unlock, and detach steps — while leaving the operator's existing human visual-QA pass untouched. It does **not** produce a print-ready PDF, assemble covers, or perform booklet imposition; those remain separate later concerns.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Assemble and download a complete quarter book (Priority: P1)

A publishing operator viewing a language's quarter (a book + series containing its Table of Contents and 13 lessons) triggers a single "assemble and download" action. The system assembles the Table of Contents followed by lessons 1–13 into one editable document and delivers it for download, without the operator opening any desktop master-document workflow.

**Why this priority**: This is the entire value of the feature — replacing the manual assembly workflow with one action. Without it there is no feature.

**Independent Test**: On a language whose quarter has all 13 lessons plus the Table of Contents available, trigger the assemble action for a given mode and confirm a single downloaded document contains the Table of Contents first, then lessons 1 through 13 in order, and can be opened and edited (no locked/protected sections).

**Acceptance Scenarios**:

1. **Given** a language quarter with a Table of Contents and all 13 lessons available, **When** the operator triggers the assemble-and-download action, **Then** the system produces one document containing the Table of Contents followed by lessons 1–13 in order and delivers it for download.
2. **Given** the assembled document has been produced, **When** the operator opens it in a word processor, **Then** every section is editable — there are no protected sections and no externally linked content.
3. **Given** the assembled document, **When** the operator reviews page numbers, **Then** numbering runs continuously across the whole book and each lesson's first page shows no page number.

---

### User Story 2 - Choose bilingual or single-language output (Priority: P1)

The operator can assemble the quarter in either bilingual mode (mother-tongue translation alongside a majority/reference language) or single-language mode (mother tongue only), mirroring the two per-lesson download options that already exist.

**Why this priority**: Both output modes are core deliverables today; a quarter book is produced in both. Supporting only one mode would leave half the workflow manual.

**Independent Test**: For the same quarter, trigger assembly in bilingual mode and in single-language mode and confirm each produces a correctly ordered, editable quarter document consistent with the corresponding per-lesson output.

**Acceptance Scenarios**:

1. **Given** a quarter available for assembly, **When** the operator chooses bilingual assembly, **Then** the assembled book presents each string bilingually, consistent with the existing per-lesson bilingual download.
2. **Given** a quarter available for assembly, **When** the operator chooses single-language assembly, **Then** the assembled book presents mother-tongue content only, consistent with the existing per-lesson single-language download.
3. **Given** a quarter where some strings are not yet translated, **When** the operator assembles in either mode, **Then** the assembled book uses the same partial-translation fallback the per-lesson download uses today — the feature imposes no stricter completeness bar than single-lesson download.

---

### User Story 3 - See progress and receive the finished file (Priority: P2)

Because assembling 14 documents takes longer than a comfortable instant response, the action starts a background assembly and shows the operator an in-progress indicator until the file is ready, at which point it is delivered for download.

**Why this priority**: Assembly is expected to exceed a comfortable synchronous wait; without visible progress the operator cannot tell whether the request is working or hung. It is P2 because the core value (US1/US2) is the produced document; this governs how the wait is experienced.

**Independent Test**: Trigger assembly on a valid quarter and confirm the UI shows an in-progress indicator while assembly runs, then transitions to delivering the download when the document is ready.

**Acceptance Scenarios**:

1. **Given** the operator triggers assembly, **When** the job is running, **Then** the UI shows an in-progress ("Assembling…") indicator rather than a frozen or unresponsive control.
2. **Given** assembly completes successfully, **When** the document is ready, **Then** the operator can download the finished quarter document.
3. **Given** the operator triggers assembly for a quarter+mode that is already being assembled, **When** the second request is made, **Then** the system does not start redundant assembly work and the operator is shown the progress of the already-running assembly.

---

### User Story 4 - Blocked when the quarter is incomplete (Priority: P2)

If any of the 14 constituent documents (Table of Contents or any of the 13 lessons) is missing or cannot be generated, the system refuses to produce a partial book and tells the operator specifically what is missing.

**Why this priority**: A silently partial book is worse than a clear stop — an operator could unknowingly publish an incomplete quarter. It is P2 because it guards the P1 happy path rather than delivering it.

**Independent Test**: On a quarter missing one or more lessons (or where a lesson fails to generate), trigger assembly and confirm no document is produced and the message identifies the missing/failing lesson(s).

**Acceptance Scenarios**:

1. **Given** a quarter missing one or more of its 13 lessons or its Table of Contents, **When** the operator triggers assembly, **Then** no assembled document is produced and the operator sees a message identifying which lesson(s) are missing.
2. **Given** all constituent documents exist but one fails to generate during assembly, **When** the job runs, **Then** the job ends in a failed state with a human-readable reason (identifying the failing lesson where possible), offers no partial file, and the operator can re-trigger the action to retry.

---

### Edge Cases

- **Incomplete quarter**: Handled by US4 — assembly is blocked with a message naming the missing lesson(s); no partial book is produced.
- **Mid-assembly failure**: The job enters a failed state with a human-readable reason; no partial file is delivered; the operator retries manually (no automatic retry).
- **Duplicate / double-clicked request**: A second request for the same quarter + mode while one is running attaches to the running job rather than starting redundant work (US3 scenario 3).
- **Interruption before completion**: If assembly is interrupted before it finishes (e.g. the serving process restarts), no partial file is delivered and the operator can simply re-request; no durable job state is expected to survive the interruption.
- **Result availability after completion**: A finished assembled document remains available for download for a bounded window after completion; if it is no longer available, the operator re-requests assembly. (See Assumptions.)
- **Partial translation**: Assembly proceeds using the same fallback as per-lesson download; translation progress below 100% does not block assembly.
- **Access**: The assemble action is available to the same operators who can already download the individual lessons on that language page; it introduces no new access rules of its own.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST let an operator assemble a single quarter book — the Table of Contents followed by lessons 1–13 in order — for a given language, book, and quarter (series) through one action, and deliver it as a single downloadable document.
- **FR-002**: The assembled document MUST be self-contained and fully editable when opened: no protected/locked sections and no externally linked content. _(Confirmed feasible by the WS-2a spike — see Assumptions.)_
- **FR-003**: Page numbering in the assembled document MUST run continuously across all lessons, and each lesson's first page MUST suppress its page number, matching the output the manual master-document workflow produces today. Consistent with that reference output, each lesson MUST begin on an odd (right-hand) page, with a blank verso inserted where needed. _(WS-2a spike confirmed continuous numbering + first-page suppression are feasible; making pagination book-correct — removing a +1 offset and enforcing odd-page starts — is a scoped page-style task, `page-usage="right"` on the lesson first-page master. See Assumptions.)_
- **FR-004**: The system MUST support both bilingual and single-language assembly, producing output consistent with the corresponding existing per-lesson download in each mode, including the same partial-translation fallback behavior.
- **FR-005**: The system MUST NOT apply any stricter translation-completeness requirement than the existing single-lesson download applies.
- **FR-006**: The system MUST NOT produce an assembled document if any of the 14 constituent documents is missing or fails to generate; instead it MUST block or fail with a message identifying the missing or failing lesson(s).
- **FR-007**: The assemble action MUST run as a background job so the operator is not blocked by a long synchronous wait, and MUST show an in-progress indicator while assembly runs.
- **FR-008**: When a valid assembly completes, the system MUST deliver the finished quarter document to the operator for download.
- **FR-009**: When an assembly job fails after starting, the system MUST surface a human-readable failure reason, MUST NOT offer a partial file, and MUST allow the operator to re-trigger the action to retry. Retries are operator-initiated; the system performs no automatic retry.
- **FR-010**: A second request for the same (language, book, quarter, mode) while an assembly for it is already in progress MUST NOT start redundant assembly work; the requester MUST be shown the progress of the existing job.
- **FR-011**: The system is NOT required to persist assembly-job state durably; if assembly is interrupted before completion, the operator re-requests. No partial or stale book is ever delivered as if complete.
- **FR-012**: The assemble-and-download action MUST be presented per quarter, alongside the existing per-lesson download controls on the language page, and MUST offer the bilingual and single-language options in a manner consistent with the existing per-lesson download controls.

### Key Entities _(include if feature involves data)_

- **Quarter book**: The deliverable this feature produces — a single assembled document for one (language, book, quarter/series, mode) consisting of the Table of Contents followed by lessons 1–13 in order. A quarter (the code's `series`) comprises 13 lessons plus a Table of Contents.
- **Constituent document**: One of the 14 per-lesson documents (the Table of Contents plus each of the 13 lessons) that are assembled into the quarter book, produced by the existing per-lesson generation used for single-lesson download.
- **Assembly job**: The background unit of work that produces one quarter book for a given (language, book, quarter, mode). It has an observable status (in progress → ready / failed) and, on failure, a human-readable reason. It is transient and not required to survive an interruption of the serving process.
- **Assembly mode**: Bilingual or single-language, mirroring the two existing per-lesson download modes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An operator can produce a correctly ordered, continuously numbered, fully editable assembled quarter document from a single action, without opening any desktop master-document assembly workflow.
- **SC-002**: The manual master-document assembly, export, unlock, and detach steps (SOP §13–§15) are no longer needed for the assembled-document portion of the workflow — 100% of that manual assembly is replaced by the action.
- **SC-003**: For a complete quarter, 100% of assemble requests either deliver a full 14-part book (Table of Contents + 13 lessons in order) or fail with a message identifying what is missing — no partial book is ever delivered.
- **SC-004**: The assembled output requires no manual correction beyond the operator's existing visual-QA pass — the automation introduces no new category of defect that the manual workflow did not already require fixing.
- **SC-005**: While an assembly runs, the operator always sees a clear in-progress state and is never presented with a frozen or unresponsive control; on completion the finished document is downloadable, and on failure a human-readable reason is shown.

## Assumptions

- **Spike gate (RESOLVED — GO).** The WS-2a assembly feasibility spike is complete (`spike/FINDINGS.md`; beads `lessons-from-luke-koog.1`). Result: **GO.** LibreOffice headless (`soffice`) can merge the TOC + 13 lesson ODTs into one fully-editable `.odt` (0 protected/linked sections — FR-002 confirmed) with continuous page numbering and per-lesson first-page suppression (FR-003 confirmed), preserving all image references. Mechanism: `insertDocumentFromURL` driven from a StarBasic macro in-process in `soffice` (LO's bundled Python is unusable on macOS but fine on the Linux server; either driver reaches the same UNO call). **Two documented gaps for planning, both scoped page-style tasks (not feasibility blockers):** (a) **pagination is not yet book-correct** — numbering is continuous but has a +1 offset and lessons don't yet start on odd/right-hand pages; fix is `style:page-usage="right"` on the lesson first-page master (`PrintEmptyPages` already true), which reserves blank versos and rationalizes numbering. (b) the per-lesson footer **Quarter/Lesson number fields render blank** after merge (they are `meta.xml` custom-property-backed `text:user-defined` fields that `insertDocumentFromURL` does not carry over). This must be closed to satisfy FR-004's "output consistent with the per-lesson download"; the spike documents a scriptable fix (flatten each lesson's footer fields to literal text before insertion). `/sp:03-plan` may now proceed and MUST budget that field-flattening step. Concurrency note: `soffice` is effectively single-instance — serialize the assembly step or use isolated per-job profiles.
- **Reuse of existing per-lesson generation.** Assembly reuses the existing per-lesson document-generation pipeline unchanged as the source of the 14 constituent documents, including its bilingual/single-language switch and partial-translation fallback. No change to the existing per-lesson download endpoints or UI is in scope.
- **Access control.** The assemble action is available to the same operators who can already download individual lessons on the language page; this feature defines no new authorization rules.
- **Result lifetime.** A completed assembled document is available for download for a bounded window after completion (matching existing temporary-output cleanup behavior); after that the operator re-requests. Exact retention duration is deferred to planning.
- **Concurrency scale.** This is a small-team, low-concurrency tool; job tracking need not be durable or clustered. The mechanism (in-memory vs. persisted job tracking, polling shape, job-identity scheme) is deferred to planning.
- **Progress granularity.** The in-progress indicator is a simple indeterminate "Assembling…" state (queued / running / ready / failed); per-step or percentage progress is not required.

## Dependencies

- **WS-2a assembly feasibility spike** (blocking; see Assumptions). Must confirm the chosen assembly approach preserves continuous numbering, per-lesson first-page suppression, correct footers, image integrity, and full editability before planning proceeds.
- **Existing per-lesson document generation** used for single-lesson download, reused unchanged as the constituent-document source.

## Out of Scope

- PDF export of the assembled quarter (a separate later phase, WS-2c).
- A3 booklet imposition and PDF compression (desktop-tool territory).
- Cover assembly and cover population (a separate workstream, WS-3).
- Any change to the existing per-lesson download endpoints or UI.
- Any new translation-completeness gating policy.
- Any durable/queued job-tracking infrastructure (persistent job table, external queue).

## Clarifications

### Session 2026-07-06

- Q: When an operator requests assembly of a (language, book, quarter, mode) that already has a job in progress — or clicks twice — how should the system behave? → A: Reuse the in-flight job — a second request attaches to the running job instead of starting a duplicate assembly.
- Q: What level of in-progress feedback should the operator see during assembly? → A: A simple indeterminate "Assembling…" state (queued / running / ready / failed); no per-step count or percentage.
- Q: If an assembly job fails after it starts (LibreOffice error, or a lesson fails mid-run), what should the operator experience? → A: The job moves to a failed state showing a human-readable reason, offers no partial file, and the operator re-triggers to retry (no automatic retry).
- Q: (Sequencing) The source brainstorm places the WS-2a feasibility spike before specify, and it has not been run — proceed with the product spec now? → A: Proceed with the technology-agnostic product spec; record the spike as a blocking dependency on the plan phase and flag the deviation.
