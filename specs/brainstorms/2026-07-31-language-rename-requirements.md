---
date: 2026-07-31
topic: language-rename
---

# Language Project Rename

## Problem Frame

Admins cannot correct or change a language project's name after creation (typos, naming-convention changes). The name is display-only throughout the system — languages are identified by `languageId` and `code`, never by name — so a rename capability is low-risk and purely an admin quality-of-life improvement on the language project admin page (`LanguageView`).

## Requirements

**Rename UI (admin language page)**

- R1. The language name heading on the admin language page gains an "Edit" link-button beside it, following the app's established toggle-to-edit pattern (text link → input with save/cancel), not a pencil icon.
- R2. Clicking Edit swaps the name display for a text input pre-filled with the current name, with Save and Cancel actions. Cancel restores the display unchanged.
- R3. On successful save, the displayed name updates immediately (heading, admin language list, and anywhere else the name is shown via state).

**Validation & errors**

- R4. Empty or whitespace-only names are rejected; the name is trimmed before save.
- R5. Renaming to a name already used by another language is rejected with the same duplicate-name (409) feedback the create-language form uses, surfaced inline in the edit UI.

## Success Criteria

- An admin can rename a language from its admin page and see the new name reflected across the app without a reload.
- A rename cannot silently collide with another language's name or produce an empty name.
- Non-admins have no path to rename (existing route + `/api/admin` middleware gating suffices — no new access control).

## Scope Boundaries

- No pencil icon / no new icon system — reuse the existing "Edit" link-button pattern (consistency over novelty, per DESIGN.md).
- No renaming of previously generated/downloaded ODT artifacts; future generated filenames simply use the new name.
- Desktop app untouched; renames reach desktop clients via the existing down-sync as with any language data change.
- No rename history/audit trail.
- Language `code` and `languageId` are unchanged — this is display-name only.

## Key Decisions

- **"Edit" link over pencil icon**: The codebase has no icon library; three existing screens use the text "Edit" link → inline input pattern, and the `Edit` i18n string already exists. User confirmed.
- **Enforce name uniqueness on rename**: The create path returns 409 on duplicates; rename must not become a bypass.

## Dependencies / Assumptions

- The existing language update endpoint silently drops `name` (field whitelist); enabling rename requires widening that path and the client update thunk — an expected part of this work, noted here because it is the bulk of the change.

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Whether a DB-level unique constraint exists on `languages.name` (check migrations) or uniqueness is app-enforced only; decide if rename needs a constraint or just the app check.

## Next Steps

-> `/sp:02-specify` to create the formal specification from this document.
