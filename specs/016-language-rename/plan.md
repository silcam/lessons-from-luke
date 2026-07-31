# Implementation Plan: Language Project Rename

**Branch**: `016-language-rename` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/016-language-rename/spec.md`

## Summary

Give admins an inline rename control on the language project admin page (`LanguageView`). The
language name becomes mutable post-creation while `languageId` and `code` stay immutable.

Technical approach, smallest change that satisfies the spec:

1. **Server** — widen the `objFilter` whitelist on `POST /api/admin/languages/:languageId` to
   accept `name`, and validate it in the controller (**presence test → type guard** (D-006) → trim →
   non-empty → length + character bounds (D-007) → write the trimmed value back (D-008) → duplicate
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
**Performance Goals**: N/A at this scale. Note for accuracy (Constitution Principle 0): the added
cost of the rename path itself is one extra `storage.languages()` read, but the request as a whole
is dominated by `updateLanguageChecked`, which calls `updateProgress()`
(`PGStorage.ts:368`) after **every** update — a full recompute that reads all languages, all
lessons, per-lesson `lessonStrings` and per-language `tStrings`, then issues one
`UPDATE languages SET progress=…` per language. This is **pre-existing, shared with the
`motherTongue`/`defaultSrcLang` paths, and explicitly not to be optimized in this feature**. It is
recorded because it (a) makes the in-flight Save guard below a real safeguard rather than a
nicety, and (b) means Save latency is visibly non-instant on a populated database — do not design
the UI around an instantaneous response.
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
1. Reject a non-string / empty-after-trim / over-100-character / control-character `name` → **422**
   (shape/validation error, matching `isNewLanguage`'s 422 on the create path). **The presence test
   is normative — see D-006; the length and character bounds are D-007.** Then **write the trimmed
   value back into the update object — see D-008.**
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

- **Maximum 100 characters** after trimming → **422**. This is a **display/sanity bound only**.

  **Correction — the bound does not deliver filename safety, and must not be described as if it
  does.** An earlier draft claimed 100 characters "leaves headroom under the 255-byte filename
  ceiling once the `_Book-Qn-Lnn.odt` suffix and multi-byte UTF-8 are accounted for". That is
  arithmetically false for exactly this app's target scripts: `documentName()` appends ~16 ASCII
  bytes, and 100 characters of a 3-byte-per-character script (Devanagari, Ge'ez, CJK, and most
  non-Latin scripts a minority-language translation tool serves) is ~300 bytes, giving ~316 bytes —
  well over the ~255-byte ceiling.

  **Do not add a byte-length bound to fix this.** A `Buffer.byteLength(trimmed, "utf8")` check would
  reject legitimate names — a 70-character Devanagari project name is comfortably under the
  character bound and over any workable byte bound — which is a worse outcome than a long filename
  in a tool built for non-Latin languages. Keep the 100-**character** bound, honestly labelled:
  filename safety for multi-byte names is **not** achieved and is out of scope here. Recorded, not
  actioned.

- **Reject C0/C1 control characters** -> **422**. Trimming strips only leading/trailing whitespace,
  so an embedded newline, tab or NUL survives today and corrupts both the language-list rendering
  and the download filename (`documentName()` composes the name straight into the filename string).
  Write the predicate with **escape sequences only** -- never literal control characters in the
  source file (this plan originally embedded them literally and had to be corrected):

  ```ts
  // eslint-disable-next-line no-control-regex
  const FORBIDDEN_NAME_CHARS = /[\u0000-\u001F\u007F-\u009F]/;
  ```

  `no-control-regex` is ESLint-recommended, so the targeted disable comment is required; per
  Constitution V a commented, single-line suppression is preferred to relaxing the rule
  project-wide.

- **Unicode bidi characters are deliberately NOT rejected (Low, recorded not actioned).** An earlier
  draft of this decision proposed banning `U+200E/200F` and `U+202A-202E`. That set was both
  over-broad (it includes `U+202C POP DIRECTIONAL FORMATTING`, a legitimate terminator) and
  under-inclusive (it omits the `U+2066-2069` isolates, the actual modern spoofing vector), and no
  concrete harm was demonstrated for this feature -- names render as escaped React text children,
  and the admin population is trusted and single-digit. Settling Unicode policy is out of scope
  here. If it is ever taken up, it belongs on the **create** path too, and therefore in its own
  feature. Do not silently reintroduce a bidi character class into `FORBIDDEN_NAME_CHARS`.

- **Filename-hostile characters are deliberately NOT rejected (Low, recorded not actioned).** The
  control-character rule above cites the download filename as its driver, which invites the question
  "why not `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` too?" — characters far likelier to appear than
  a NUL and illegal in filenames on Windows. Answer: `Kaqchikel/Guatemala` is a plausible language
  project name, and making it unrenameable is a worse defect than a browser-sanitized download
  filename. **There is no security dimension to close here** — evidence, as of 2026-07-31: a
  repo-wide search for `content-disposition`, `res.download` and `attachment;` across `src/` returns
  **zero** matches, and the sole consumer of `documentName()` is client-side —
  `saveAs(new Blob(...), documentName(language.name, lesson))` at
  `src/frontend/web/documents/useGetDocument.tsx:21`. The name never reaches an HTTP response header,
  so there is no header-injection / response-splitting vector, and the residual is a cosmetically
  wrong filename only. Do not reopen this without first re-checking that evidence.

This is a **rename-path-only** rule. Per D-003's scope reasoning, `POST /api/admin/languages`
(create) is not changed, so a pre-existing over-long or control-character name remains until
renamed. Accepted, and recorded rather than left implicit.

### D-008 — The trimmed value must be written back, not merely compared

D-002 step 5 says "pass the **trimmed** name to `updateLanguageChecked`", which is easy to satisfy
_by accident of phrasing_ and easy to violate in code. The natural implementation computes
`const trimmed = langUpdate.name.trim()` for the emptiness, length and duplicate checks and then
passes `langUpdate` — still holding the **untrimmed** value — to `updateLanguageChecked`. Every
validation test still passes; only FR-005 / US2 scenario 3 fail, and only for an input nobody types
by hand.

Binding: after validation, assign the trimmed value back (`langUpdate.name = trimmed`) — or build
the update object from `trimmed` — before the storage call. The RED test named in the Acceptance
Test Strategy ("name accepted and persisted trimmed") must assert on the **stored/returned** value,
not on the response status.

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
- The client-side `TextInput` **must not** set a hard `maxLength` at the same 100-character bound.
  A truncating `maxLength` makes the over-length branch unreachable from the UI, so the
  `Language_name_too_long` message and its component test become dead code, and the admin silently
  loses characters instead of being told. Let the input accept the over-long value and surface the
  server's `422` inline. All rules are enforced server-side; the client bound is never the check.

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
- **Save is disabled for in-flight state only, never for content validity (binding).**
  `AddLanguageForm` computes `formValid = name.length > 0` and passes `disabled={!formValid}` to its
  Save button. Copying that line into the rename editor — the natural move, since the Presentation
  Design says to style the editor after `AddLanguageForm` — **breaks US2 scenario 1 and FR-006**:
  an admin who clears the field gets a dead button and _no feedback at all_, where the spec requires
  the rename to be "rejected, feedback shown inline". It also renders the server's empty-name `422`
  branch and the `Language_name_required` message unreachable from the UI, so the component test for
  them tests nothing. Note the failure is specific to the _truly empty_ case: a whitespace-only
  value passes `length > 0`, reaches the server, and is rejected correctly — which is exactly why
  the gap survives casual manual testing. This is the same argument the Security Considerations
  section already makes against a client-side `maxLength`, applied to the lower bound: the client
  must never make a server validation branch unreachable. The rule: **the only condition that
  disables Save is an outstanding push.**
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

### Focus Management (WCAG 2.4.3 Focus Order)

Required behavior:

- Activating **Edit** removes the `Edit` button from the DOM, destroying the user's focus position
  and dropping focus to `<body>` — a keyboard/screen-reader dead end. Focus must move to the
  `TextInput` on activation.
- On **Save (success)** and on **Cancel**, focus must return to the re-rendered **Edit** control.
- On **Save (validation failure)**, keep focus in the input (the editor stays open with the typed
  value per D-004) so the error is not announced into a void.

**Mechanism is binding — a `ref` will not work.** An earlier draft of this section prescribed
"a `ref` + `focus()` in a `useEffect` keyed on the editing flag". That is **unimplementable against
the existing base components** and must not be attempted: `Button`
(`base-components/Button.tsx`) and `TextInput` (`base-components/TextInput.tsx`) are plain React 16
function components with no `forwardRef` wrapper, so a `ref` prop is a type error and, at runtime,
a "Function components cannot be given refs" warning with `ref.current === null`. An implementer who
discovers this mid-task will improvise (`document.getElementById`, a wrapper-div
`querySelector`, or silently dropping the requirement). Use this instead:

- **Focus the input**: pass **`autoFocus`** to the `TextInput`. `TextInput` spreads its remaining
  props onto the underlying `<input>` and already declares `autoFocus?: boolean`. The input mounts
  exactly when Edit is activated, so mount-time autofocus _is_ activation-time focus. No ref, no
  effect.
- **Return focus to Edit**: pass **`autoFocus={returningFromEditor}`** to the Edit `Button`.
  `Button` spreads `...sbProps` (typed as `React.ButtonHTMLAttributes`, which includes `autoFocus`)
  onto the styled `<button>`, and the Edit button re-mounts when the editor closes.
- **`returningFromEditor` MUST NOT be true on first render.** Seed it `false` and set it `true` only
  in the Save-success and Cancel handlers. An unconditional `autoFocus` on the Edit button — or the
  equivalent effect keyed on `[editing]`, which also runs on mount — steals focus from wherever the
  admin actually is when the Languages page first renders, and scrolls the page to the name row.
  This is the same class of defect as D-004a: the shortest expression of the rule is the wrong one.
- Do **not** add `forwardRef` to `Button` or `TextInput` for this feature. Those are shared base
  components used across the app; widening them is scope creep with a far larger blast radius than
  the two `autoFocus` props above.

### Live-Region Announcement

The existing `srcLangUpdateFailed` / `archiveUpdateFailed` blocks mount the `role="alert"` container
and its text **together**. A live region that enters the DOM already populated is unreliably
announced across screen readers. For the rename error, **render the `role="alert"`
`aria-live="assertive"` container unconditionally** and toggle only its text content. (Do not
retrofit the two existing blocks — out of scope.)

"Unconditionally" means **for the lifetime of the editor**, not for the lifetime of the screen: the
empty `role="alert"` container mounts together with the editor when Edit is activated and unmounts
with it. That is sufficient — the region exists and is empty before any error text is inserted,
which is the condition assistive technology needs. Do **not** place it outside the editor's
conditional block, where it would be an always-present empty region on a screen that has no editor.

### Heading Continuity

The `<h3>` name heading is replaced by the input while editing, so the section temporarily loses its
heading. Label the input with the existing `Language_name` key via a real `<label>`/`Label`
association (not a placeholder), and keep the input inside the same container so the region is not
left unheaded and anonymous.

`Label` (`base-components/Label.tsx`) renders a real `<label>` that **associates implicitly by
wrapping its children** — it emits no `htmlFor` and the components take no `id`. So the `TextInput`
MUST be rendered as a **child of `Label`** (as `AddLanguageForm` does for its `SelectInput`). Do not
attempt `htmlFor`/`id` pairing; that prop does not exist on these components and adding it is the
same scope creep rejected under Focus Management.

### Keyboard Parity

The editor MUST support **Enter to submit** and **Escape to cancel**. Implement the editor as a
`<form onSubmit>`. Both Save and Cancel must be reachable and operable by keyboard, in that DOM
order.

**Correction — there is no local form precedent.** An earlier draft of this section justified the
form with "`AddLanguageForm` is a form, so an Enter press that works on the create screen and does
nothing on the rename control is an inconsistency". That premise is **false and must not be
repeated**: `AddLanguageForm` is a `<Div>` whose Save is a plain `Button onClick`, and a repo-wide
search for `<form` / `onSubmit` / `type="submit"` / `type="button"` across `src/frontend` returns
**zero** matches. Enter does nothing on the create screen today. Enter-to-submit is still required —
it stands on its own WCAG/keyboard-parity merit — but the rename editor will be the **first `<form>`
in the codebase**, so there is nothing to copy and the button contract below must be stated
explicitly rather than inferred.

#### Form and button contract (binding)

`Button` (`base-components/Button.tsx`) destructures `{ text, link, ...sbProps }` and spreads the
rest onto a `<button>` **without ever setting `type`**. Inside a `<form>`, an unqualified `<button>`
defaults to `type="submit"`. Two concrete defects follow, neither of which exists anywhere in the
app today because the app has no forms:

- **Cancel would save.** A `Cancel` `Button` inside the form is a submit button: clicking it fires
  its `onClick` **and** submits the form, so the rename is persisted. This violates FR-003 and US1
  acceptance scenario 4 ("Cancel → nothing is saved") directly.
- **Save would post twice.** `Button`'s `onClick` prop is **required** (non-optional in `IProps`), so
  `<Button type="submit" onClick={save}>` fires `save()` from the click handler and again from the
  native submit, in the same tick. **The in-flight guard cannot stop this**: the second invocation
  reads the pre-render value of the `useState` flag, which is still `false`. The explicit `type`
  props below are therefore the _only_ thing preventing a double POST — they are not a tidiness
  preference.

Required shape:

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault(); // no local example to copy; without it the form navigates
    if (!saving) save();
  }}
>
  <Label text={t("Language_name")}>
    <TextInput autoFocus value={draft} setValue={...} />
  </Label>
  {/* role="alert" region — see Live-Region Announcement */}
  <Button type="submit" onClick={() => {}} disabled={saving} text={t("Save")} />
  <Button type="button" red onClick={cancel} disabled={saving} text={t("Cancel")} />
</form>
```

- `onSubmit` is the **single** save path; the Save button contributes no behavior of its own.
- Save's `onClick={() => {}}` is a deliberate no-op, forced by `Button`'s required `onClick` prop.
- Do **not** make `onClick` optional on `Button`, and do **not** otherwise modify `Button` — same
  shared-base-component scope-creep argument that already forbids adding `forwardRef` under Focus
  Management. `SBProps extends React.ButtonHTMLAttributes`, so `type` passes through unchanged.

**The keyboard paths MUST honour the in-flight guard** (see Edge Cases → In-flight Save). Disabling
the Save and Cancel _buttons_ while a push is outstanding leaves both keyboard affordances wide
open: `Enter` fires the `<form onSubmit>` handler regardless of any button's `disabled` state, and
an `Escape` key handler is ordinary code with no `disabled` semantics at all. Gate the submit
handler and the Escape handler on the same in-flight flag that disables the buttons — the flag is
the guard; the `disabled` attributes are only its visible expression.

### Test Coverage

`LanguageView.test.tsx` additions: focus lands on the input after activating Edit; focus returns to
the Edit control after Cancel; the Edit control does **not** hold focus on first render (guards the
`returningFromEditor` seed); Escape cancels; Enter submits.

Plus, guarding the Form and Button Contract above: **clicking Cancel with a changed draft issues no
POST** (guards `type="button"` on Cancel), and **clicking Save issues exactly one POST** (guards
Save's no-op `onClick`; assert on the call count, not merely that a request occurred).

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
  Cancel restores and posts nothing (**assert zero POSTs** — this is the `type="button"` guard from
  the Form and Button Contract); Save posts exactly once; Save updates the heading; 409/422 render inline feedback and
  keep the editor open with the typed value. Plus: **clearing the field and pressing Save posts and
  renders the `Language_name_required` feedback** — this test is what keeps the Save button from
  being disabled on empty content (see Edge Cases).
- `cypress/integration/language-rename.US1.spec.ts` — admin renames a language and sees the new
  name in the heading and the language list without a reload; a duplicate rename is rejected inline.
  **Assert on list content, not list position.** `addLanguage` merges via
  `modelListMerge(…, languageCompare)` (`languageSlice.ts:39`), and `languageCompare` sorts by
  `name`, so a rename generally moves the entry within the admin language list. An assertion keyed
  to an index or `:nth-child` is fixture-dependent and will break on an unrelated fixture change.
  The reorder itself is correct behavior, not a defect.

## Complexity Tracking

> No Constitution Check violations. Section intentionally empty.
