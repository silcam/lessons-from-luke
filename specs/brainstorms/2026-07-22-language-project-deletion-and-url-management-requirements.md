---
date: 2026-07-22
topic: language-project-deletion-and-url-management
---

# Language Project Deletion and URL Management

## Problem Frame

Two related gaps in the admin-facing Languages screen (`src/frontend/web/languages/`):

1. **No way to remove a language project.** The client wants admins to be able to delete a language project once it's no longer needed. Today `Persistence` has no delete/archive method at all for languages, and there's no confirmation-dialog pattern anywhere in the frontend to build it on top of.
2. **No real URLs for language detail views.** `LanguagesBox` selects a language purely via local React state (`selectedLanguage`), so clicking a language changes what's rendered but never touches the browser URL or history. Refreshing the page, sharing a link, or using back/forward all drop the admin back to the bare Languages list. The rest of the app already uses `react-router-dom` v6 for this pattern (e.g. `/lessons/:id`), just not here.

## Requirements

**Deletion (archive, not hard delete)**

- R1. Admins can archive a language project from its detail view.
- R2. Archiving is a soft delete: the language and all associated data (tStrings, progress, uploaded documents) remain in the database, but the language no longer appears in the active Languages list and can no longer be translated into.
- R3. Archiving is one-way from the UI's perspective — there is no restore/un-archive UI. (Data is preserved in the DB, but any un-archiving would require direct DB access, not a product feature.)
- R4. Any language (not just English) can be another language's `defaultSrcLang` (source-text language). Before allowing archive, the system checks whether other active languages point to this one as their `defaultSrcLang`.
- R5. If dependent languages exist, archiving is blocked and the admin sees which languages depend on it, so they can re-point those first.
- R6. If no dependents exist, the admin can proceed, behind a confirmation step (exact confirmation UX — e.g. plain yes/no vs. typed-name confirmation — is a planning decision, not resolved here).
- R7. Navigating directly to an archived language's detail URL redirects to the Languages list rather than rendering a detail (or archived-readonly) view.

**URL management for language detail views**

- R8. Selecting a language from the Languages list navigates to a real, addressable URL (`/languages/:languageId`) using the existing `react-router-dom` v6 setup, rather than only updating local component state.
- R9. Refreshing the browser while viewing a language detail page returns to that same language's detail view (not the bare Languages list).
- R10. Browser back/forward and direct link sharing work correctly for language detail views.

## Success Criteria

- An admin can archive a language project that's no longer needed, without being able to accidentally break other languages' translation source chains.
- Refreshing, sharing, or using back/forward on a language detail page preserves the admin's place instead of bouncing to the Languages list.

## Scope Boundaries

- No restore/un-archive feature (UI-level) — out of scope per R3.
- No changes to the Languages _list_ page's own URL/foldable state — only the language _detail_ view gains a route in this pass.
- No bulk archive/delete of multiple languages at once.
- No change to how `defaultSrcLang` dependents are re-pointed (that remains the existing per-language source-language picker in `LanguageView`) — this feature only blocks archiving and surfaces the dependent list, it doesn't build new re-pointing UX.

## Key Decisions

- Soft delete (archive) over hard delete: translation work (tStrings, progress, uploaded documents) represents real effort and should not be irrecoverably destroyed by a UI action.
- One-way from the UI: simplifies the feature (no restore UI/state machine) while still leaving data recoverable at the DB level if ever truly needed.
- Dependency block (not just a warning): a dangling `defaultSrcLang` reference would silently break translation for every language pointing at the archived one, which is a worse failure mode than a blocked action with a clear reason.
- Route shape `/languages/:languageId`: matches the existing flat pattern (`/lessons/:id`) rather than nesting under `/admin/*`.

## Dependencies / Assumptions

- Assumes `defaultSrcLang` dependency lookup only needs to consider currently-active (non-archived) languages — an archived language pointing at another archived language is not a live dependency concern.
- Assumes English (`ENGLISH_ID`) needs no special-casing beyond the general dependency check, since it will almost always have dependents and get blocked naturally.

## Outstanding Questions

### Deferred to Planning

- [Affects R2][Technical] What does "archived" look like at the storage layer — a boolean/status column on the language row, a separate archived-languages table, or a timestamp field? `Persistence.languages()` and related queries need to exclude archived languages by default.
- [Affects R4][Technical] Where does the dependency check live — server-side validation on an archive endpoint, or a client-side check using already-loaded language data? Given `LanguagesBox` already loads all admin languages, a client-side check may be sufficient, but the archive endpoint should still enforce it server-side to avoid races.
- [Affects R6][User decision, low-stakes] Exact confirmation UX for the archive action (plain confirm dialog vs. typed-name confirmation) — no confirm/modal component currently exists in `src/frontend/common/base-components/`, so this also involves picking or building that base component. Can be decided in planning against `DESIGN.md`.
- [Affects R8][Technical] Whether the Languages list's own folded/selected state should sync with the route (e.g. auto-unfold when landing on `/languages/:id` via direct link) — needed for R9 to work correctly from a cold load.

## Next Steps

-> /sp:02-specify
