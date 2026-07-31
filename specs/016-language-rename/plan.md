# Implementation Plan: Language Project Rename

**Branch**: `016-language-rename` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-language-rename/spec.md`

## Summary

Give admins an inline rename control on the language project admin page (`LanguageView`). The
language name becomes mutable post-creation while `languageId` and `code` stay immutable.

Technical approach, smallest change that satisfies the spec:

1. **Server** — widen the `objFilter` whitelist on `POST /api/admin/languages/:languageId` to
   accept `name`, and validate it in the controller (type guard → trim → non-empty → duplicate
   check), mirroring the create endpoint's validation site and semantics. **No `Persistence`
   interface change and no storage-implementation change**: `updateLanguageChecked` already takes
   `Partial<Language>`, already sets `modified`, and already 404s for missing/archived targets.
2. **Contract** — widen the `POST /api/admin/languages/:languageId` request body type in
   `src/core/interfaces/Api.ts` with an optional `name?: string`.
3. **Client** — add a dedicated `pushLanguageRename(languageId, name)` thunk to `languageSlice`
   (not a widening of `pushLanguageUpdate`, which unconditionally ships `motherTongue` +
   `defaultSrcLang` on every toggle). It dispatches the existing `addLanguage` reducer, which is
   what makes the heading and the admin language list update without a reload.
4. **UI** — an "Edit" link-button beside the `Heading` in `LanguageView`, toggling to a
   `TextInput` + Save/Cancel + `Alert danger`, reusing the toggle-to-edit idiom already used by
   `LessonPage`, `LessonStringEditor`, and `DocStringsPage`.
5. **No database migration.** See the duplicate-enforcement decision below.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm)
**Primary Dependencies**: React 16, Redux Toolkit, `react-router-dom` v6, Express, `postgres@1`
(domain driver, reached only via `Persistence`)
**Storage**: existing PostgreSQL `languages` table — **no schema change, no migration**
**Testing**: Jest (`*.test.ts(x)`, `--runInBand`) for unit/integration; Cypress for the web E2E flow
**Target Platform**: Web (Express + React admin UI). Desktop/Electron untouched.
**Project Type**: Web — isomorphic four-layer (`core` / `server` / `frontend` / `desktop`)
**Performance Goals**: N/A — one extra `storage.languages()` read per rename request, single-digit
admin concurrency
**Constraints**:

- Admin-only; no new access control (existing `/api/admin` gating + admin route gating suffice)
- No new icon system — text "Edit" link only (DESIGN.md: consistency over novelty)
- Rename must not change `languageId` or `code`
- Renames reach desktop clients through existing down-sync with **zero** desktop-side change

**Scale/Scope**: single-digit admins, tens of language projects; ~5 source files touched.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-07-31-language-rename-requirements.md](../brainstorms/2026-07-31-language-rename-requirements.md)

### Key Decisions Carried Forward

- **"Edit" link over pencil icon**: the codebase has no icon library; three screens already use the
  text-`Edit`-link → inline-input idiom, and the `Edit` i18n key already exists (`en.ts:41`). Do not
  re-litigate; a pencil icon is out of scope.
- **Enforce name uniqueness on rename**: the create path returns 409 on duplicates; rename must not
  become a bypass.
- **Scope boundaries (explicit non-goals)**: no rename of previously generated ODT artifacts; no
  rename history/audit trail; no desktop-side change; `code`/`languageId` immutable.

### Deferred Questions (resolved during planning)

- _Does a DB-level unique constraint exist on `languages.name`, and does rename need one?_ →
  **No constraint exists and none will be added.** `migrations/1582711758713-LoadSchema.js:13`
  declares `name text` (nullable, no `UNIQUE`), and no later migration alters it. Uniqueness stays
  **application-level**. Full rationale in [research.md](research.md#r-001); summary:
  1. Create-path uniqueness is **case-insensitive** (`languagesController.ts:29`), which a plain
     `UNIQUE(name)` would not express — it would need `UNIQUE (lower(name))`.
  2. Create-path uniqueness is scoped to **active rows only** (`storage.languages()` is
     `WHERE NOT archived`). A DB constraint spans archived rows and would _break_ currently-legal
     creation, i.e. reusing an archived language's name. This is the decisive argument.
  3. `name` is nullable and unconstrained today, so production rows may already hold NULLs or
     duplicates; a unique index would require a data-cleanup migration with no product driver.
  4. `LocalStorage` (desktop) has no equivalent constraint, so DB-level enforcement would be
     asymmetric across `Persistence` implementations.

  **Accepted consequence**: a rename may collide with an _archived_ language's name, exactly as
  creation may. **Accepted residual risk**: the check-then-write window is not transactional; the
  spec's Assumptions already elect last-write-wins at this scale.

## Presentation Design

**Component Framework**: React 16 + existing `src/frontend/common/base-components/` kit
(`Heading`, `Button link`, `TextInput`, `Alert`, `Div`)
**Interaction Patterns**: local `useState` toggle-to-edit; Redux Toolkit `addLanguage` for the
post-save propagation; no routing change
**Accessibility Target**: WCAG 2.2 AA — error feedback rendered in a `role="alert"`
`aria-live="assertive"` region (matching the existing `srcLangUpdateFailed` /
`archiveUpdateFailed` blocks in `LanguageView`); the input is labelled with the existing
`Language_name` key.

### UI Decisions

| Screen / Component                               | User Story | Approach                                                                                                                                       | Design Skills |
| ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `LanguageView` name row — "Edit" link + heading  | US1        | `Heading level=3` + `Button link text={t("Edit")}`; existing toggle-to-edit idiom (`LessonPage.tsx:60`, `LessonStringEditor.tsx:53`)           | —             |
| `LanguageView` inline name editor (input + save) | US1        | `TextInput` pre-filled with current name + `Button Save` + `Button red Cancel`, styled after `AddLanguageForm`                                 | —             |
| Inline rename error feedback                     | US2        | `Alert danger` inside a `role="alert"` region; message cleared on keystroke, exactly as `AddLanguageForm` clears `nameError` in its `setValue` | —             |

**i18n decision (do not defer to the implementer)**: `Edit`, `Save`, `Cancel`, and `Language_name`
keys already exist in `en.ts`. `AddLanguageForm` _hardcodes_ its English duplicate message
("A language with that name already exists."). For FR-007 consistency, add proper keys to
`src/core/i18n/locales/en.ts` — `Language_name_duplicate` (same wording as the create form's
string, so the two read identically), `Language_name_required`, and `Language_name_too_long`
(D-007) — and use `t()` in the new editor. All three 422 sub-cases (non-string, empty, control
characters) surface `Language_name_required`; only the length case surfaces
`Language_name_too_long`, because the server returns a bare `422` with no discriminator and the
client distinguishes them from the **locally known** submitted value, not from the response body. Do **not** refactor `AddLanguageForm` in this feature (out of scope; a follow-up may
adopt the keys). `fr.ts` is intentionally partial and already omits recently added keys such as
`Archive_update_failed`; no `fr.ts` change is required (i18n falls back to English).

### Quality Pass

**Design quality target**: Production
**Post-implementation refinement**: None planned — this is a three-control addition to an existing
screen using existing components; the constraint is consistency, not novelty.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                               | Status | Notes                                                                                                                                                                                           |
| --------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Fidelity to Reality                  | PASS   | The deferred migration question was answered by reading the migrations, not assumed. The 404-vs-409 ordering below exists because the spec's edge case demands a truthful not-found signal.     |
| I. Test-First Development               | PASS   | RED-first Jest tests in `languagesController.test.ts` (exists) and `LanguageView.test.tsx` (exists); user-facing flow additionally covered by a new Cypress spec. See Acceptance Test Strategy. |
| II. Type Safety and Static Analysis     | PASS   | `Api.ts` post-body type widened so the client thunk is typed end-to-end; `req.body.name` is `unknown` after `objFilter`, so an explicit `typeof === "string"` guard is required (no `any`).     |
| III. Code Quality Standards             | PASS   | Naming follows the glossary term **Language (project)**; JSDoc on the new thunk and the new controller validation helper.                                                                       |
| IV. Pre-commit Quality Gates            | PASS   | Standard `yarn typecheck` + lint-staged; conventional commits; never `--no-verify`.                                                                                                             |
| V. Warning and Deprecation Policy       | PASS   | No new deps, no deprecated APIs.                                                                                                                                                                |
| VI. Layered Architecture / Dual Targets | PASS   | Domain data still flows only through `Persistence`; **no `Persistence` signature change** (`updateLanguageChecked` already accepts `Partial<Language>`). Desktop untouched; see FR-010 below.   |
| VII. Simplicity and Maintainability     | PASS   | No migration, no new storage method, no new endpoint — one whitelist entry, one validation block, one thunk, one UI toggle. Rejecting the DB unique index is the YAGNI-consistent choice.       |

**Post-Phase-1 re-check**: PASS. The design added no new abstraction; the only contract change is
one optional field on an existing request-body type. Complexity Tracking is therefore empty.

## Project Structure

### Documentation (this feature)

```text
specs/016-language-rename/
├── plan.md              # This file
├── research.md          # Phase 0 output — duplicate-enforcement decision
├── data-model.md        # Phase 1 output — Language.name mutability + validation rules
├── quickstart.md        # Phase 1 output — how to exercise the rename locally
└── contracts/
    └── language-rename.md   # POST /api/admin/languages/:languageId widened body + error precedence
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── interfaces/Api.ts                  # widen POST /api/admin/languages/:languageId body: name?: string
│   └── i18n/locales/en.ts                 # + Language_name_duplicate, Language_name_required, Language_name_too_long
├── server/
│   └── controllers/
│       ├── languagesController.ts         # whitelist "name"; guard + trim + empty(422) + duplicate(409)
│       └── languagesController.test.ts    # RED-first server tests (file exists)
└── frontend/
    ├── common/state/languageSlice.ts      # + pushLanguageRename(languageId, name) thunk
    └── web/languages/
        ├── LanguageView.tsx               # Edit link → inline editor → Save/Cancel + Alert
        └── LanguageView.test.tsx          # RED-first component tests (file exists)

cypress/integration/
└── language-rename.US1.spec.ts           # E2E happy path + duplicate rejection

migrations/                                # UNCHANGED — no migration in this feature
```

**Structure Decision**: The existing four-layer web structure is used unchanged. The feature is a
vertical slice through `core` (contract + i18n), `server` (controller), and `frontend`
(state + view). The `desktop` layer is deliberately not touched, and `Persistence` /
`PGStorage` / `testStorage` / `LocalStorage` are deliberately not touched — see the validation-site
decision below.

## Design Decisions (binding on implementation)

### D-001 — Validate in the controller, not inside `updateLanguageChecked`

Duplicate and emptiness validation lives in `languagesController`, next to the identical create-path
check. Rationale:

- **Symmetry with create.** FR-007 asks for "the same duplicate-name response behavior as language
  creation"; putting the check at the same layer keeps the two literally the same code shape.
- **Zero `Persistence` blast radius.** Pushing the check into `updateLanguageChecked` would widen
  that method's contract with 409 semantics that must then be mirrored in `testStorage` and any
  other implementation, for no product gain.
- **The spec licenses the race.** Assumptions: "Concurrent rename conflicts are resolved
  last-write-wins … no locking is required at this scale (single-digit admin count)." The in-transaction
  variant buys atomicity the spec explicitly declines to require.

### D-002 — Error precedence: 404 before 409 (the trap D-001 creates)

Spec edge case: "A rename attempt against a language that was archived or removed in another session
fails with a **not-found** error surfaced to the admin, not a silent success." A naive
"duplicate-check first, then update" ordering would return **409** for an archived target whose new
name collides — a wrong and confusing signal.

Required implementation ordering in the controller:

0. Steps 2–4 run **only when `name` is present** in the filtered body. A `motherTongue`-only or
   `defaultSrcLang`-only update must not pay for an extra `storage.languages()` read, and must keep
   its current behavior byte-for-byte.
1. Reject a non-string / empty-after-trim `name` → **422** (shape/validation error, matching
   `isNewLanguage`'s 422 on the create path). **The presence test is normative — see D-006.**
2. Read `const active = await storage.languages()` (active rows only — verified: `PGStorage`
   filters `WHERE NOT archived` at `PGStorage.ts:34`, and `testStorage.languages()` filters
   `!lang.archived` at `testStorage.ts:19`, so absence from this list is a reliable
   archived-or-deleted signal in both implementations).
3. Locate the target by `languageId` in `active`. **If absent, or present with `archived` true**
   (belt-and-braces, so the rule does not depend on the filter above), skip the duplicate check
   entirely and fall through to `updateLanguageChecked`, which throws `{ status: 404 }`.
4. **If present and active**, compare the trimmed, lower-cased name against the _other_ entries only
   (`lang.languageId !== id`). Any match → **409**. Renaming to the language's own current name is
   therefore always allowed (FR-007, US2 scenario 4).
5. Pass the **trimmed** name to `updateLanguageChecked` (FR-005, US2 scenario 3).

This precedence is normative and is restated as a table in
[contracts/language-rename.md](contracts/language-rename.md).

### D-003 — Trim on rename only; create's non-trimming behavior is unchanged

`AddLanguageForm`/the create endpoint do not trim today. Rename will trim (FR-005). Consequence: a
pre-existing untrimmed row such as `" Français"` can never be collided with by a rename of another
language, because the comparison trims only the incoming value while the stored value keeps its
padding. **Accepted residual**, not a defect to fix here: the brainstorm's Scope Boundaries keep the
create path out of scope, the condition requires an already-malformed row, and widening the change
to create would require its own tests and a data question about existing rows. The spec's
"duplicate comparison must not be bypassable by surrounding whitespace" requirement is satisfied for
the incoming value, which is the bypass vector the spec names. Record this as a known limitation for
red-team review rather than silently leaving it undocumented.

### D-006 — Presence test must be `"name" in langUpdate`, not `typeof name === "string"`

**This is the highest-severity trap in the feature and is binding.** `objFilter`
(`src/core/util/objectUtils.ts:30`) copies a whitelisted key using `field in obj`, so it omits keys
absent from the body but **preserves an explicitly supplied `null`**. A body of `{"name": null}`
therefore yields `langUpdate === { name: null }`.

The natural — and wrong — way to express D-002 step 0 is:

```ts
// WRONG. `null` is not a string, so validation is skipped entirely and
// { name: null } flows into updateLanguageChecked → SET name = NULL.
if (typeof langUpdate.name === "string") {
  /* trim / empty / duplicate checks */
}
```

That silently NULLs `languages.name` (the column is nullable, `PGStorage.ts:120` builds its column
list from the update object's keys). The damage is not confined to one row: `setAdminLanguages`
sorts with `languageCompare`, which calls `a.name.localeCompare(b.name)` unconditionally
(`Language.ts:44`), so a single NULL name makes the **entire admin languages page throw on load**.
The public `/api/languages` list sorts the same way. Recovery would require a manual SQL fix.

Required shape:

```ts
// CORRECT. Presence, then type.
if ("name" in langUpdate) {
  if (typeof langUpdate.name !== "string") throw { status: 422 };
  /* trim / empty / length / duplicate checks; write back the trimmed value */
}
```

Corollary: the same presence-then-type discipline applies to `objFilter`'s other whitelisted keys,
but `motherTongue`/`defaultSrcLang` are out of scope here and keep their current behavior.

**Required RED tests** (`languagesController.test.ts`): `{ name: null }` → 422 and the stored name
is unchanged; `{ name: 42 }` → 422; `{ motherTongue: true }` with no `name` key → 200 and the name
is unchanged (proves the key is not emitted when absent).

### D-007 — `name` shape validation: maximum length and control characters

No length or character bound exists anywhere today — `isNewLanguage` (`Language.ts:35`) checks
`typeof === "string"` only, and the column is unconstrained `text`. Rename makes an unbounded name
trivially reachable, and the value is fanned out into: every `SelectInput` option in `LanguageView`,
the admin language list, `Archive_language_dependents` interpolation, and — via
`documentName(language.name, lesson)` (`Lesson.ts:30`) — the **filename of every downloaded ODT**,
where filesystems cap at ~255 bytes and an over-long name makes the download fail or be silently
truncated by the browser.

Required, enforced in the controller alongside the emptiness check (step 1 of D-002):

- **Maximum 100 characters** after trimming → **422**. (100 comfortably exceeds any real language
  project name and leaves headroom under the 255-byte filename ceiling once the
  `_Book-Qn-Lnn.odt` suffix and multi-byte UTF-8 are accounted for.)
- **Reject C0/C1 control characters and Unicode bidi overrides** (`/[�--‎‏‪-‮]/`)
  → **422**. Trimming strips only leading/trailing whitespace, so an embedded newline or an
  RTL-override survives today and would corrupt the language list rendering and the download
  filename.

This is a **rename-path-only** rule. Per D-003's scope reasoning, `POST /api/admin/languages`
(create) is not changed, so a pre-existing over-long or control-character name remains until
renamed. Accepted, and recorded rather than left implicit.

### D-004 — A separate `pushLanguageRename` thunk

`pushLanguageUpdate` always posts `{ motherTongue, defaultSrcLang }`. Widening it would make every
mother-tongue toggle also submit a name and subject it to rename validation. Add
`pushLanguageRename(languageId, name)` posting `{ name }` only; on success dispatch
`languageSlice.actions.addLanguage(updatedLanguage)`, which merges into `adminLanguages` and
therefore refreshes both the `LanguageView` heading (it renders `props.language`, selected from the
store by `LanguagesBox`) and the admin language list — no reload, satisfying FR-004.

**D-004a — the editor MUST read `props.language.name`, never `activeLang`.** `LanguageView` holds
`const [activeLang, setActiveLang] = useState(props.language)`, initialized **once** and never
re-synced from props (there is no `useEffect` sync). Today that is harmless because
`pushLanguageUpdate` posts only `motherTongue`/`defaultSrcLang`. It stops being harmless the moment
a name lives in that object: after a successful rename, `props.language.name` is the new value
(`LanguagesBox` derives `selectedLanguage` from `state.languages.adminLanguages`, verified at
`LanguagesBox.tsx:21,33`) while `activeLang.name` is still the **old** value. An implementer who
prefills the editor from `activeLang` — the nearer variable — ships a screen where the second rename
in a session opens prefilled with the stale pre-rename name and silently reverts it on save.

Binding rules:

- Prefill the `TextInput` from `props.language.name`.
- Re-seed the editor's local draft state whenever the editor is **opened** (set it in the Edit
  click handler), not from a `useState` initializer that would itself go stale.
- Do **not** add `name` to `activeLang`, and do **not** widen `pushLanguageUpdate`.
- Required RED test in `LanguageView.test.tsx`: rename A→B, reopen the editor, assert the input
  holds **B**.

Error handling uses the `usePush` error-handler channel exactly as `AddLanguageForm` does: handle
409 (duplicate) and 422 (empty) inline, return `true` to suppress the global error banner; let 404
and network failures fall through to the banner while the editor stays open with the typed value
(spec edge case).

### D-005 — FR-010 (desktop sync) is satisfied without change — verified, not assumed

`updateLanguageChecked` sets `modified: Date.now()` on every update, and `PGStorage.languages()`
already selects `name`. The existing `/api/sync/:timestamp/languages/...` down-sync therefore
carries a rename to desktop clients like any other language mutation. No `LocalStorage` or
`downSync` change; the desktop app has no rename UI and needs none.

## Security Considerations

### Input Validation (server is authoritative)

- **Presence-then-type narrowing** on `name`, per D-006. An explicitly-null `name` must be a 422,
  never a pass-through to the SQL builder. This is the one input path in the feature that can cause
  persistent, app-breaking damage.
- **Bounded and character-restricted** per D-007 (≤100 chars trimmed; no C0/C1 control characters or
  Unicode bidi overrides). Unbounded admin-supplied text that reaches a download filename and every
  rendered list is worth a bound even with a trusted, single-digit admin population.
- The client-side `TextInput` may add a `maxLength` for ergonomics, but **all** rules are enforced
  server-side; the client bound is never the check.

### Access Control (unchanged, re-verified)

Rename adds **no new endpoint and no new route**, so it inherits `/api/admin` gating and the
admin-only route guard verbatim (FR-008, SC-004). No relaxation is introduced. Explicitly out of
scope, and unchanged by this feature: CSRF posture and rate limiting on `/api/admin/*` — the
endpoint already accepted state-changing POSTs before this feature, so rename widens no existing
surface. Do not add rate limiting here.

### Output Encoding

The name is rendered through React text children only (`Heading text=`, `SelectInput` options,
`t("Archive_language_dependents", { names })`), which escapes. **No rename-related value may be
routed through `dangerouslySetInnerHTML`** — the app's only such usage is `DocPreview.tsx:53` for
document HTML, which this feature must not touch.

## Edge Cases & Error Handling

### Client state

- **Stale `activeLang`** — see D-004a. The single most likely correctness defect in this feature.
- **In-flight Save**: the Save control MUST be disabled (or the handler guarded) while the push is
  outstanding. Without it, a double-click or Enter-then-click issues two POSTs; the second races the
  first and, if the first succeeded, the second re-sends the same name and is accepted as a
  self-rename no-op (harmless) — but the two `addLanguage` dispatches can land out of order. Cheap
  to prevent, expensive to diagnose.
- **Cancel during an in-flight Save**: closing the editor must not leave a pending `addLanguage`
  dispatch that reopens or overwrites state. Cancel while saving is disallowed (Cancel disabled with
  Save), which is simpler than unmount-safety plumbing.

### Server-side and cross-session

- **Concurrent duplicate renames** (two admins renaming different languages to the same new name):
  the check-then-write window is non-transactional by design (D-001, spec Assumptions:
  last-write-wins). Both may succeed, producing two active languages sharing a name. **Accepted
  residual**, now recorded explicitly rather than implied. Consequence to remember: a duplicate pair
  is not self-healing — a later rename of either one is validated against the other and rejected.
- **Archived-in-another-session target** → 404 before 409, per D-002/the contract. Verified in both
  implementations: `PGStorage.ts:110` and `testStorage.ts:63` each throw `{ status: 404 }` for a
  missing-or-archived row, so the D-002 RED test ("archived target → 404 even when the name
  collides") is satisfiable against `testStorage`.
- **NULL `name` in the duplicate comparison**: the create path already does
  `lang.name.toLowerCase()` unguarded, and the rename check copies that shape. Research R-001's
  point 3 speculates that "production rows may already hold NULLs"; that speculation is
  **contradicted** by `languageCompare` (`Language.ts:44`), which would already crash the admin list
  on load for any NULL row. NULLs therefore cannot exist in a working database. Use
  `(lang.name ?? "").toLowerCase()` anyway as a one-token defensive guard — but do **not** treat
  this as a real hazard, and do not add a cleanup migration. (Low.)
- **Trimmed-only-incoming collision gap**: unchanged accepted limitation, D-003.

## Accessibility Requirements

WCAG 2.2 AA. The `role="alert"` region named in the Presentation Design is necessary but not
sufficient; the toggle-to-edit idiom has three further obligations the plan did not state.

### Focus Management (WCAG 2.4.3 Focus Order, 3.2.1 On Focus)

- Activating **Edit** removes the `Edit` button from the DOM, destroying the user's focus position
  and dropping focus to `<body>` — a keyboard/screen-reader dead end. Move focus to the `TextInput`
  on activation (a `ref` + `focus()` in a `useEffect` keyed on the editing flag).
- On **Save (success)** and on **Cancel**, return focus to the re-rendered **Edit** control.
- On **Save (validation failure)**, keep focus in the input (the editor stays open with the typed
  value per D-004) so the error is not announced into a void.

### Live-Region Announcement

The existing `srcLangUpdateFailed` / `archiveUpdateFailed` blocks mount the `role="alert"` container
and its text **together**. A live region that enters the DOM already populated is unreliably
announced across screen readers. For the rename error, **render the `role="alert"`
`aria-live="assertive"` container unconditionally** and toggle only its text content. (Do not
retrofit the two existing blocks — out of scope.)

### Heading Continuity

The `<h3>` name heading is replaced by the input while editing, so the section temporarily loses its
heading. Label the input with the existing `Language_name` key via a real `<label>`/`Label`
association (not a placeholder), and keep the input inside the same container so the region is not
left unheaded and anonymous.

### Keyboard Parity

The editor MUST support **Enter to submit** and **Escape to cancel**. Implement the editor as a
`<form onSubmit>` — `AddLanguageForm` is a form, so an Enter press that works on the create screen
and does nothing on the rename control is an inconsistency users will hit immediately. Both Save and
Cancel must be reachable and operable by keyboard, in that DOM order.

### Test Coverage

`LanguageView.test.tsx` additions: focus lands on the input after activating Edit; focus returns to
the Edit control after Cancel; Escape cancels; Enter submits.

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec gets an acceptance spec
> file during `sp:05-tasks`, in `specs/acceptance-specs/` in GWT format.

Existing acceptance specs run to `US14-language-detail-url.txt`, so this feature continues at
**US15** / **US16**.

| User Story                                        | Acceptance Spec File                                    | Scenarios |
| ------------------------------------------------- | ------------------------------------------------------- | --------- |
| US1: Admin renames a language project             | `specs/acceptance-specs/US15-rename-language.txt`       | 4         |
| US2: Invalid rename attempts are rejected clearly | `specs/acceptance-specs/US16-reject-invalid-rename.txt` | 4         |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Tasking note for `sp:05-tasks`**: the tasks that _write_ these two `.txt` files must not carry a
`US`-prefixed title, or Ralph routes them into the ATDD cycle and blocks
(`.specify/solutions/tooling/ralph-atdd-routing-blocks-spec-only-tasks.md`).

**Unit/integration layer (Constitution I, RED first)**:

- `src/server/controllers/languagesController.test.ts` — name accepted and persisted trimmed;
  non-string rejected 422; empty/whitespace-only rejected 422; duplicate (case-insensitive)
  rejected 409; own unchanged name accepted; archived target → 404 even when the name collides
  (D-002); `motherTongue`/`defaultSrcLang` updates unaffected. Plus D-006: `{ name: null }` → 422
  **and the stored name unchanged**; `{ name: 42 }` → 422; a body with no `name` key leaves the name
  intact. Plus D-007: 101-character name → 422; name containing `\n` → 422.
- `src/frontend/web/languages/LanguageView.test.tsx` — Edit link present; editor pre-filled;
  Cancel restores and posts nothing; Save updates the heading; 409/422 render inline feedback and
  keep the editor open with the typed value.
- `cypress/integration/language-rename.US1.spec.ts` — admin renames a language and sees the new
  name in the heading and the language list without a reload; a duplicate rename is rejected inline.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
