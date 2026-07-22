# Feature Specification: Language Project Archiving and Detail-View Routing

**Feature Branch**: `012-language-archive-routing`
**Created**: 2026-07-22
**Status**: Draft
**Brainstorm**: specs/brainstorms/2026-07-22-language-project-deletion-and-url-management-requirements.md
**Beads Epic**: `lessons-from-luke-e044`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-e044.1`
- red-team: `lessons-from-luke-e044.2`
- tasks: `lessons-from-luke-e044.3`
- analyze: `lessons-from-luke-e044.4`
- implement: `lessons-from-luke-e044.5`
- harden: `lessons-from-luke-e044.6`

**Input**: User description: "Admin ability to archive (soft-delete) a language project, blocked when other languages depend on it as their defaultSrcLang, plus real routable URLs for language detail views (/languages/:languageId) so refresh/back/forward/sharing work correctly."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Archive a language project that's no longer needed (Priority: P1)

An administrator manages the list of language projects and wants to remove one that is no longer active (e.g. a translation effort that was abandoned or a duplicate/test entry), without destroying the translation work already recorded against it.

**Why this priority**: This is the client's core ask — an admin currently has no way to remove a language project at all.

**Independent Test**: An administrator opens a language project with no other languages depending on it, chooses to archive it, confirms, and sees it disappear from the active Languages list.

**Acceptance Scenarios**:

1. **Given** an admin viewing a language project with no other language depending on it as a source language, **When** the admin chooses to archive it and confirms, **Then** the language is archived, disappears from the active Languages list, and its translation data (translated strings, progress, uploaded documents) is retained, not deleted.
2. **Given** an admin viewing a language project, **When** the admin chooses to archive it but cancels the confirmation, **Then** nothing changes and the language remains active.
3. **Given** a language has just been archived, **When** any translator opens the language-selection list used to choose a language to translate into, **Then** the archived language no longer appears there.

---

### User Story 2 - Prevent archiving a language other languages depend on (Priority: P1)

An administrator attempts to archive a language project that one or more other language projects use as their source language (the language they translate from). Archiving it would strand those other projects with a broken source reference.

**Why this priority**: Without this guard, archiving is destructive to unrelated, still-active translation work — this is a correctness requirement, not a nice-to-have, and must ship with the archive capability itself.

**Independent Test**: An administrator attempts to archive a language that at least one other active language currently uses as its source language, and is blocked with a clear explanation of which language(s) depend on it.

**Acceptance Scenarios**:

1. **Given** one or more active languages have this language set as their source language, **When** the admin attempts to archive it, **Then** the archive action is blocked and the admin sees the list of dependent languages.
2. **Given** a language has dependents shown per Scenario 1, **When** the admin re-points those dependents to a different source language and no active language depends on this one anymore, **Then** the admin can subsequently archive it successfully.
3. **Given** a language has no active dependents, **When** the admin archives it, **Then** the action proceeds without any blocking message.

---

### User Story 3 - Language detail view has a real, shareable URL (Priority: P2)

An administrator opens a language project from the Languages list to view its details, translate progress, and management actions. Today this only changes what's on screen, not the browser URL — refreshing the page, using back/forward, or sharing the link all fail to return to that language.

**Why this priority**: This is a real workflow annoyance today (losing your place on refresh), but it's independent of and non-blocking for the archiving capability, so it can ship on its own value.

**Independent Test**: An administrator opens a language's detail view, copies the browser URL, and — in a fresh tab, or after a page refresh — lands directly on that same language's detail view rather than the bare Languages list.

**Acceptance Scenarios**:

1. **Given** an admin is on the Languages list, **When** they select a language, **Then** the browser URL changes to reflect that specific language's detail view.
2. **Given** an admin is viewing a language's detail view via its URL, **When** they refresh the page, **Then** they land back on that same language's detail view (not the bare Languages list).
3. **Given** an admin is viewing a language's detail view, **When** they use the browser back button, **Then** they return to the Languages list; using forward returns them to the language detail view.
4. **Given** an admin has a language detail URL, **When** they open it directly (e.g. from a shared link) while signed in as an admin, **Then** the language's detail view renders directly, without first landing on the Languages list.

---

### Edge Cases

- **Direct navigation to an archived language's URL**: redirects to the Languages list rather than rendering a detail view or an error.
- **Archiving the language currently open in someone else's translation session**: any subsequent action by that translator against the archived language is rejected with a clear message; the translator is not silently left working against invisible/broken data.
- **Attempting to archive a language with zero translation progress** (e.g. just created, unused): follows the same flow as any other language — dependency check, then confirmation.
- **Non-admin users**: cannot see the archive action, cannot reach `/languages/:languageId` as an admin-only detail view, and never see archived languages in any list they can access.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Administrators MUST be able to archive an active language project from its detail view.
- **FR-002**: Archiving a language MUST be a soft delete: the language's translated strings, progress history, and uploaded documents are retained in storage, not deleted.
- **FR-003**: An archived language MUST NOT appear in the admin-facing Languages list, the public/translator-facing language-selection list, or any other language picker in the system.
- **FR-004**: An archived language MUST NOT be usable as a translation target — attempting to translate into it (including via a direct URL to its translate view) MUST be rejected.
- **FR-005**: Before archiving completes, the system MUST require the administrator to explicitly confirm the action, and MUST make clear that the action cannot be undone from within the product.
- **FR-006**: The system MUST NOT provide any in-product way to restore (un-archive) a language once archived.
- **FR-007**: Before allowing a language to be archived, the system MUST check whether any other active (non-archived) language currently designates it as their source language.
- **FR-008**: If one or more active languages depend on the language being archived as their source language, the system MUST block the archive action and MUST show the administrator which language(s) depend on it.
- **FR-009**: If no active language depends on it, the system MUST allow the archive action to proceed (subject to FR-005's confirmation).
- **FR-010**: Selecting a language from the Languages list MUST update the browser's URL to a distinct address for that language's detail view.
- **FR-011**: Loading a language's detail-view URL directly (e.g. via page refresh, shared link, or new tab) MUST render that same language's detail view, provided the requester is an authenticated administrator and the language is active.
- **FR-012**: Browser back/forward navigation MUST move between the Languages list and a language's detail view consistently with standard web navigation expectations.
- **FR-013**: Loading an archived language's detail-view URL directly MUST redirect to the Languages list rather than rendering a detail or error view.
- **FR-014**: Only administrators MUST be able to archive a language project or view the archive action; non-administrators MUST NOT see or be able to trigger it.

### Key Entities

- **Language project** (referred to elsewhere in the codebase as "Language"): A translation target with a name, code, progress history, and a designated source language it translates from. This feature adds an archived/active status to it. Archiving is one-way from the product's perspective; there is no restore capability in the product.
- **Source language dependency**: The relationship where one language project designates another as the language it translates from. A language with one or more active dependents cannot be archived until those dependents are re-pointed elsewhere.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An administrator can archive a language project with no dependents, start to finish, in under 30 seconds without needing engineering assistance.
- **SC-002**: 100% of archived languages are absent from every language-selection list (admin and translator-facing) immediately after archiving.
- **SC-003**: 100% of attempts to archive a language with active dependents are blocked, with the dependent language(s) named to the administrator.
- **SC-004**: 100% of page refreshes, back/forward navigations, and shared-link opens of a language detail view return the same language's detail view that was open before, eliminating the current 100% failure rate (today, every refresh loses the selection).

## Assumptions

- The dependency check (FR-007/FR-008) only considers currently-active languages; an archived language pointing at another archived language is not treated as a live dependency.
- English (`ENGLISH_ID`) receives no special-casing beyond the general dependency check in FR-007 — since most other languages depend on it as their source, it will typically be blocked from archiving naturally.
- The exact confirmation UI (e.g. a simple yes/no prompt vs. a typed-name confirmation) is left to planning; FR-005 only requires that some explicit, clear confirmation step exists.
- Storage-level representation of "archived" (e.g. a status flag, timestamp, or separate table) is a planning/implementation decision, not a product decision, and is deferred to `/sp:03-plan`.
- Where the archive action's dependency check is enforced (client-side using already-loaded data vs. server-side validation) is deferred to planning; regardless of where it's surfaced in the UI, the server MUST be the source of truth to prevent race conditions.
- The Languages list's own folded/selected local UI state should sync with the route so that landing on `/languages/:id` via a direct link renders correctly on a cold load; exact mechanism deferred to planning.

## Clarifications

### Session 2026-07-22

- Q: When an admin deletes a language project, what should happen to its data (tStrings, progress, documents)? → A: Soft delete (archive) — data retained, hidden from active use.
- Q: Should an archived language be restorable later? → A: No, one-way from the UI's perspective; no restore UI.
- Q: Should English (or any language) be exempt from archiving? → A: No special-casing; instead, block archiving based on whether other active languages depend on it as their source language (any language, not just English, can be a source).
- Q: How should the system handle attempts to archive a language with dependents? → A: Block with a list of dependent languages, rather than warning-and-allow or no check at all.
- Q: What route shape should the language detail view use? → A: `/languages/:languageId`, matching the existing flat `/lessons/:id` pattern.
- Q: What happens when navigating directly to an archived language's URL? → A: Redirect to the Languages list.
- Q: Should archiving also remove the language from the public/translator-facing language list, and block direct `/translate/:code` access? → A: Yes, hide everywhere and block translate access.
