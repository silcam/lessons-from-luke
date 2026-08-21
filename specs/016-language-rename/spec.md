# Feature Specification: Language Project Rename

**Feature Branch**: `016-language-rename`
**Created**: 2026-07-31
**Status**: Draft
**Beads Epic**: `lessons-from-luke-fm4a`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-fm4a.1`
- red-team: `lessons-from-luke-fm4a.2`
- tasks: `lessons-from-luke-fm4a.3`
- analyze: `lessons-from-luke-fm4a.4`
- implement: `lessons-from-luke-fm4a.5`
- harden: `lessons-from-luke-fm4a.6`

**Input**: User description: "When an admin views the language project admin page, there should be an edit control next to the name of the language. Activating it allows the admin to change the name of the language project and save the change."
**Brainstorm**: specs/brainstorms/2026-07-31-language-rename-requirements.md

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Admin renames a language project (Priority: P1)

An admin viewing a language project's admin page activates an "Edit" control beside the language name, changes the name in an inline text field, and saves. The new name appears immediately on the page and everywhere else the name is displayed.

**Why this priority**: This is the entire feature — correcting typos or updating naming conventions after a language project is created is currently impossible.

**Independent Test**: Can be fully tested by opening a language's admin page as an admin, renaming it, and confirming the new name is shown on the page and in the admin language list without a reload.

**Acceptance Scenarios**:

1. **Given** an admin is viewing a language project's admin page, **When** they look at the language name, **Then** an "Edit" control is visible beside it.
2. **Given** the admin activates the Edit control, **When** the inline editor appears, **Then** it is pre-filled with the current name and offers Save and Cancel actions.
3. **Given** the admin has typed a new valid name, **When** they save, **Then** the name display updates immediately (heading and admin language list) and persists across reloads.
4. **Given** the admin has opened the inline editor, **When** they cancel, **Then** the original name is displayed unchanged and nothing is saved.

---

### User Story 2 - Invalid rename attempts are rejected clearly (Priority: P2)

An admin attempting to save an empty name, a whitespace-only name, or a name already used by another language sees clear inline feedback and the rename is not applied.

**Why this priority**: Prevents data quality problems (blank or colliding names) that would confuse translators and admins across the app; the create-language form already enforces these rules, and rename must not become a bypass.

**Independent Test**: Can be tested by attempting to rename a language to an empty string and to another language's existing name, confirming both are rejected with visible feedback and the original name remains.

**Acceptance Scenarios**:

1. **Given** the inline editor is open, **When** the admin saves an empty or whitespace-only name, **Then** the rename is rejected, feedback is shown inline, and the original name remains.
2. **Given** another language named "Français" exists, **When** the admin renames this language to "Français", **Then** the rename is rejected with duplicate-name feedback consistent with the create-language form's behavior.
3. **Given** the admin types a name with leading/trailing whitespace, **When** they save, **Then** the trimmed name is persisted.
4. **Given** the admin re-saves the language's own current name (unchanged), **When** they save, **Then** the save succeeds without a duplicate-name error.

---

### Edge Cases

- Renaming a language to its own current name (possibly with surrounding whitespace) is not a duplicate collision — it saves successfully as a no-op.
- Duplicate-name comparison must not be bypassable by surrounding whitespace (trim before comparing).
- A rename attempt against a language that was archived or removed in another session fails with a not-found error surfaced to the admin, not a silent success.
- If the save request fails (network/server error), the editor remains open with the admin's typed value so the attempt can be retried or cancelled.
- Previously generated/downloaded lesson documents keep their old filenames; only documents generated after the rename use the new name.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The language project admin page MUST display an "Edit" control beside the language name, following the app's existing toggle-to-edit link pattern (no pencil icon / no new icon system).
- **FR-002**: Activating the Edit control MUST replace the name display with a text input pre-filled with the current name, together with Save and Cancel actions.
- **FR-003**: Cancelling MUST restore the name display without persisting any change.
- **FR-004**: Saving a valid name MUST persist the new name and update it immediately in the page heading and in the admin language list without a page reload.
- **FR-005**: The system MUST trim leading/trailing whitespace from the submitted name before validation and persistence.
- **FR-006**: The system MUST reject empty or whitespace-only names with inline feedback.
- **FR-007**: The system MUST reject a name already used by a different language, using the same duplicate-name response behavior as language creation, with inline feedback; saving the language's own unchanged name MUST succeed.
- **FR-008**: Renaming MUST be available only to admins; the existing admin gating (admin-only page routing and admin-only server endpoints) applies unchanged.
- **FR-009**: A rename MUST NOT change the language's identity (internal ID and language code); all references to the language remain intact.
- **FR-010**: Renames MUST propagate to desktop clients through the existing synchronization mechanism, with no desktop-side changes.
  _Addendum (post-merge fix):_ the "no desktop-side changes" premise was falsified — the sync flag
  read `max(created)` (renames only stamp `modified`) and `syncState.language` was never refreshed
  after initial sign-in. Fixed server-side (`max(modified)`) and desktop-side (name merge in
  `downSync.syncLanguages()`); see `plan.md` D-005 and `contracts/language-rename.md`.

### Key Entities

- **Language (project)**: A translation target with a display **name**, an internal identifier, and a public code. This feature makes the name mutable post-creation; identifier and code remain immutable. The name must be unique among languages and non-empty.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An admin can rename a language project from its admin page in under 15 seconds, and the new name is visible across the app without a reload.
- **SC-002**: 100% of rename attempts with an empty name or a name belonging to another language are rejected with visible feedback, and the original name is preserved.
- **SC-003**: A rename never breaks existing links, translation progress, or lesson data — all pre-rename functionality behaves identically after a rename.
- **SC-004**: Non-admin users have no path to rename a language (0 accessible entry points).

## Assumptions

- Duplicate-name uniqueness may be enforced at the application level only; whether a database-level unique constraint exists (or should be added) is deferred to planning (carried from brainstorm: check migrations for a unique constraint on the language name).
- Filenames of future generated lesson documents incorporate the language name and will change after a rename; this is accepted behavior, and no retroactive renaming of past artifacts occurs.
- No rename history or audit trail is required.
- Concurrent rename conflicts are resolved last-write-wins, consistent with the page's other settings (e.g. source-language changes); no locking is required at this scale (single-digit admin count).

## Clarifications

### Session 2026-07-31

- Q: Should the rename affordance be the requested pencil icon or the app's established text "Edit" link pattern? → A: The "Edit" link pattern — the app has no icon library, three screens already use the toggle-to-edit link idiom, and DESIGN.md mandates consistency over novelty.
- Q: Should duplicate names be allowed on rename? → A: No — enforce the same duplicate rejection as language creation.
