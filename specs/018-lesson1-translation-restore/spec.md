# Feature Specification: Luke Lesson 1 Translation Restoration

**Feature Branch**: `018-lesson1-translation-restore`
**Created**: 2026-08-13
**Status**: Draft
**Beads Epic**: `lessons-from-luke-amkj`
**Brainstorm**: specs/brainstorms/2026-08-13-lesson1-translation-restoration-requirements.md
**Input**: User description: "Targeted restoration of Luke Lesson 1 translations from a pre-incident database snapshot after an accidental master document re-upload orphaned translation work"

**Beads Phase Tasks**:

- plan: `lessons-from-luke-amkj.1`
- red-team: `lessons-from-luke-amkj.2`
- tasks: `lessons-from-luke-amkj.3`
- analyze: `lessons-from-luke-amkj.4`
- implement: `lessons-from-luke-amkj.5`
- harden: `lessons-from-luke-amkj.6`

## Incident Context

On Tuesday 2026-08-11, the client accidentally uploaded a **cover file** as the
master document for Luke Lesson 1 in production. The application does not yet
support cover files, so the upload replaced Lesson 1's master (English) content
with the cover page's content. As a consequence:

- Lesson 1's English content in production is now wrong (it is a cover page)
  and must be reverted or replaced with the correct Lesson 1 master content.
- The lesson's string linkage was regenerated against the cover page's text,
  so translations of the real Lesson 1 strings became **orphaned** — still
  stored, but no longer reachable through the lesson.
- Translation work in other languages has continued since the incident, so a
  whole-database rollback is not acceptable. Restoration must be targeted.

A pre-incident **Snapshot** database (taken 08:00 WAT on 2026-08-11) is
available on a separate server reachable from the production server. Each
server carries a marker file (`THIS_IS_THE_PRODUCTION_SERVER` /
`THIS_IS_THE_SNAPSHOT_SERVER`) for positive identification.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Diagnose the damage before touching anything (Priority: P1)

As the operator (developer running the recovery), I run a diagnosis that
compares production against the Snapshot and produces a full report of what
was damaged and what a restoration would change — with zero writes to
production.

**Why this priority**: Every later action depends on an accurate picture of
the damage. The report alone has standalone value: it replaces the client's
belief ("all translation work was reset") with facts, and it is the approval
gate for the restore.

**Independent Test**: Run the diagnosis in dry-run mode against production and
the Snapshot; verify a report is produced, production is unmodified
(before/after dump comparison), and the report's counts match hand-run spot
checks.

**Acceptance Scenarios**:

1. **Given** access to production and the Snapshot, **When** the diagnosis
   runs, **Then** it positively identifies which side is production and which
   is the Snapshot before doing anything else, and treats the Snapshot as
   strictly read-only.
2. **Given** the incident occurred after the Snapshot was taken, **When** the
   diagnosis runs, **Then** it identifies the affected lesson(s) from the data
   (version/modification comparison), not from assumption, and reports how
   many times the lesson was re-uploaded since the Snapshot.
3. **Given** the affected lesson, **When** the diagnosis completes, **Then**
   the report lists, per language: strings still intact, translations
   orphaned, and translations in conflict (edited in production since the
   Snapshot), with counts and sample text.
4. **Given** some affected strings are shared with other lessons (identical
   text reuse), **When** the diagnosis completes, **Then** those shared
   strings are flagged separately with the other lessons they appear in.
5. **Given** dry-run mode, **When** the diagnosis runs, **Then** no write of
   any kind is made to either database.

---

### User Story 2 - Restore the English master content (Priority: P1)

As the client, I open Luke Lesson 1 and see the correct English lesson content
again instead of the cover page.

**Why this priority**: The English master is the spine every translation hangs
from; translations cannot be re-attached to a cover page. Nothing user-visible
is fixed until this is done.

**Independent Test**: After the English restore, viewing Lesson 1 in English
(web preview and translation UI) shows the pre-incident Lesson 1 content;
comparing its strings against the Snapshot's English strings for that lesson
shows a match.

**Acceptance Scenarios**:

1. **Given** production Lesson 1 currently contains cover-page content,
   **When** the English master is restored, **Then** Lesson 1's English
   strings match the pre-incident Lesson 1 content (verified against the
   Snapshot).
2. **Given** the restoration mechanism may reuse the app's own upload
   pathway with the correct pre-incident document, **When** it runs, **Then**
   it uses the correct Lesson 1 master document — never the cover file — and
   the resulting lesson structure supports re-attaching existing translations.
3. **Given** a fresh production dump was taken before any write, **When**
   anything goes wrong mid-restore, **Then** production can be returned to
   its pre-restore state from that dump.

---

### User Story 3 - Restore translations without destroying newer work (Priority: P2)

As a translator, my pre-incident translations of Lesson 1 are visible again in
my language — and nothing I (or any other translator) did after the incident
has been overwritten.

**Why this priority**: This is the core of the recovery request, but it
requires the English spine (Story 2) to attach to.

**Independent Test**: For a sample language, compare Lesson 1's translated
strings before and after the restore: previously orphaned translations are
reachable again; any string edited after the Snapshot timestamp retains its
post-incident value; restored strings carry their prior value in history.

**Acceptance Scenarios**:

1. **Given** orphaned translations exist for the affected lesson, **When**
   the restore applies, **Then** each orphaned translation is re-attached or
   copied so it is reachable through Lesson 1 in its language again.
2. **Given** a translation was edited in production after the Snapshot
   (including shared boilerplate edited via another lesson), **When** the
   restore applies, **Then** that value is left untouched and the string is
   listed in the report as a conflict for human review.
3. **Given** a restored translation overwrote a production value, **When**
   the restore applies, **Then** the overwritten value is preserved in the
   string's history so the change is reversible in-app.
4. **Given** apply mode is requested, **When** no human has reviewed a
   dry-run report for the same diagnosis, **Then** the operator workflow
   requires the dry-run review first (apply is an explicit, separate step).
5. **Given** the restore has applied, **When** it is re-run, **Then** it
   makes no further changes (idempotent) and creates no duplicate rows.

---

### User Story 4 - Verify and hand back to the client (Priority: P3)

As the operator, after the restore I get a verification report I can send to
the client showing what was restored, and the app reflects the restored state.

**Why this priority**: Closes the loop — derived data must be recomputed and
the client needs evidence the recovery succeeded.

**Independent Test**: After apply, the verification report shows before/after
translated-string counts per language for the affected lesson; language
progress figures and web previews reflect the restored content.

**Acceptance Scenarios**:

1. **Given** the restore has applied, **When** verification runs, **Then**
   per-language before/after translated-string counts for the affected lesson
   are reported, alongside the list of conflicts left for human review.
2. **Given** the restore changed lesson content and translations, **When**
   the aftermath step runs, **Then** language progress figures and web
   previews are regenerated to match the restored state.

---

### Edge Cases

- The lesson was re-uploaded more than once since the Snapshot (the built-in
  one-version diagnostic cannot bridge multiple bumps; mapping must be
  reconstructed another way).
- The Snapshot turns out to post-date the incident — diagnosis must detect
  this (lesson version comparison) and abort with a clear message.
- Legacy translation rows scoped to a specific lesson-string linkage exist
  (a second orphan vector); diagnosis must count them before assuming the
  vector is inert.
- Modification timestamps are missing (NULL) on some translation rows;
  conflict detection must fall back to value comparison rather than trusting
  timestamps alone.
- A string's translation table has no uniqueness constraints; a careless
  write silently duplicates rows — restore writes must guard against this.
- The script is interrupted mid-apply: the pre-apply production dump is the
  recovery path; partial application must be detectable by re-running the
  diagnosis.
- The affected lesson shares strings with other lessons: restoring a stale
  value over a newer legitimate edit made via another lesson must be
  impossible under the conflict policy.
- Wrong-server confusion: the script is pointed at two databases; it must
  refuse to run if it cannot positively verify which is which.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The restoration tool MUST positively identify production vs
  Snapshot (marker files and/or data checks) before any operation, MUST treat
  the Snapshot as strictly read-only, and MUST refuse to run if identity
  cannot be verified.
- **FR-002**: The tool MUST auto-detect the affected lesson(s) by comparing
  lesson versions and modification times between production and the Snapshot,
  and MUST report the number of re-uploads since the Snapshot.
- **FR-003**: The tool MUST produce a per-language diagnosis report for the
  affected lesson: intact strings, orphaned translations, genuinely lost
  strings (if any), and conflicts — with counts and sample text.
- **FR-004**: The diagnosis MUST identify which affected strings are shared
  with other lessons and flag them separately (blast radius).
- **FR-005**: The tool MUST support a dry-run mode producing the full
  would-change report with zero writes; apply mode MUST be a separate,
  explicit invocation intended to run only after human review of the dry run.
- **FR-006**: The restoration MUST restore Lesson 1's English master content
  to the pre-incident Lesson 1 content, replacing the cover-page content
  currently in production.
- **FR-007**: The restoration MUST re-attach or copy orphaned translations so
  they are reachable through the affected lesson in each language.
- **FR-008**: Conflict policy — never overwrite newer work: any translation
  value edited in production after the Snapshot timestamp (in any language,
  including via another lesson sharing the string) MUST be left untouched and
  reported for human review. Where timestamps are unreliable, a difference
  between production and Snapshot values MUST be treated as a conflict.
- **FR-009**: Every restored value MUST pass through history-preserving write
  semantics (prior value retained in the string's history) so each individual
  change is reversible in-app.
- **FR-010**: Before any apply, a fresh production database dump MUST be
  taken so the entire restore is reversible as a unit.
- **FR-011**: Restore writes MUST be idempotent and MUST NOT create duplicate
  translation rows.
- **FR-012**: After apply, the tool (or documented runbook step) MUST
  recompute language progress figures and regenerate web previews.
- **FR-013**: The tool MUST produce a final verification report with
  per-language before/after translated-string counts for the affected lesson
  and the outstanding conflict list, suitable for sending to the client.
- **FR-014**: The operation MUST NOT modify translations, lessons, or
  languages outside the affected lesson's scope, except where re-attaching a
  shared string benignly restores the identical translation elsewhere.

### Key Entities

- **Lesson**: Curriculum unit identified by Book (Luke/Acts), Series, and
  Lesson number, with a version that increments on each master document
  upload. The affected entity: Luke Lesson 1 (series auto-detected).
- **Master document**: The English source document (ODT) for a Lesson. Its
  upload (re)generates the lesson's string structure. The incident replaced
  Lesson 1's master with a cover file.
- **Cover file**: A cover-page document not yet supported by the application;
  uploading one as a master document caused the incident.
- **TString**: A translated string with history, keyed by a master string
  identity shared across languages (and across lessons when English text is
  identical). Orphaned when its master identity is no longer referenced by
  the lesson's structure.
- **LessonString**: The linkage between a Lesson and a master string identity
  (with position/type). Deleted and regenerated wholesale on every master
  upload; prior generations are archived.
- **Snapshot**: The read-only pre-incident copy of the production database
  (08:00 WAT, 2026-08-11) on a separate server; source of truth for
  pre-incident state.
- **Diagnosis report / Verification report**: Human-readable artifacts
  gating apply (dry-run) and evidencing the outcome (post-apply).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The client can open Luke Lesson 1 and see the correct English
  lesson content (not the cover page) in the app.
- **SC-002**: For every active language, the count of reachable Lesson 1
  translations after restoration is greater than or equal to the pre-incident
  (Snapshot) count minus strings legitimately changed since — and each
  remaining gap is itemized in the verification report.
- **SC-003**: Zero translation edits made after the Snapshot timestamp are
  overwritten, anywhere in the corpus (verifiable by comparing post-restore
  values against the pre-restore dump for all strings edited since the
  incident).
- **SC-004**: Every change made by the restoration is enumerable (appears in
  the report) and individually reversible (prior value in history), and the
  whole operation is reversible via the pre-apply dump.
- **SC-005**: A dry-run leaves production byte-identical (verifiable by
  comparing dumps taken before and after a dry-run).
- **SC-006**: The client receives a verification report and confirms
  restoration — target within 2 business days of snapshot availability, given
  about one month of credit-financed runway and a payment blocked on this
  client relationship.

## Scope Boundaries

- No schema changes, migrations, or constraint additions — this is an
  operational recovery tool, not a product feature.
- Preventing recurrence (cover-file upload support or rejection, upload
  confirmation UX, automated backups) is explicitly out of scope — follow-up
  work.
- No general-purpose backup/restore tooling.
- Web/server data only; desktop client sync behavior is respected but desktop
  code is untouched.
- Do NOT run the existing database-cleanup task (its English consolidation
  deletes translations across all languages) during or after recovery.

## Assumptions

- The Snapshot server stays up and reachable from the production server until
  restoration completes (client's technical contact to maintain).
- The Snapshot predates the incident; the tool verifies this rather than
  trusting it.
- The correct pre-incident Lesson 1 master document is recoverable — the
  production filesystem retains historical versioned master documents
  independent of the database (to be verified during planning).
- Access credentials (SSH to production; SSH from production to the Snapshot
  server, key passphrase held by David) exist and are not committed anywhere.

Deferred technical questions carried from the brainstorm (for planning):

- How many version bumps occurred since the Snapshot; whether the built-in
  one-version diagnostic can bridge them or mapping must be reconstructed
  (position match and/or historical document text).
- Whether legacy lesson-string-scoped translation rows exist (second orphan
  vector) — count them in the Snapshot before assuming inert.
- Fallback conflict detection where modification timestamps are NULL (value
  comparison).
- Write path choice: application's history-preserving save path vs direct SQL
  replicating its semantics; the translation table has no uniqueness
  constraints, so naive inserts silently duplicate.
- Whether restored rows should propagate to desktop clients (their
  modification recency drives desktop sync) — set deliberately.
- Connection topology: tool likely runs on the production server (database is
  socket-only) and reaches the Snapshot database via an SSH tunnel.
- Disk space location for the pre-apply production dump.
- Whether restoring English via the app's own upload pathway with the correct
  historical document is the safest mechanism (identical text reuses existing
  master identities, auto-re-attaching translations) vs direct re-linking.

## Clarifications

### Session 2026-08-13

- Q: If a string's translation was edited (in any language) after the
  incident, should the restore overwrite it with the backup value? → A: Never
  overwrite newer work; post-incident edits always win; conflicts are
  reported for human review.
- Q: What form does the pre-incident backup take? → A: A snapshot server
  (08:00 WAT backup) reachable from production via internal IP; marker files
  identify each server.
- Q: Is the master document now in production the correct English content, or
  does the English itself need reverting? → A: The client accidentally
  uploaded a cover file (not yet supported), which replaced Lesson 1; the
  English master must be reverted/replaced with the correct Lesson 1 content.
- Q: Use the brainstorm doc as specification input? → A: Yes.
