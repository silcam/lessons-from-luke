# Phase 0 Research: Language Project Archiving and Detail-View Routing

All spec `NEEDS CLARIFICATION` items and the brainstorm's "Deferred to Planning"
questions are resolved below. Each decision records the rationale and the
alternatives considered (including the ones the brainstorm already rejected, so
planning does not re-open them).

## D1. Storage representation of "archived"

**Decision**: Add a single boolean column `archived` (default `false`, NOT NULL)
to the existing `languages` table via a new node-pg-migrate-style migration file
in `migrations/`, mirroring `1583306702630-addDefaultSrcLangColumnToLanguages.js`
(`ALTER TABLE languages ADD archived boolean DEFAULT false`).

**Rationale**: The language row already carries per-language flags
(`motherTongue`, `defaultSrcLang`); a status boolean is the smallest change that
lets every existing `SELECT ... FROM languages` filter archived rows with a
`WHERE NOT archived` clause. A separate `archived_languages` table would force a
join on every language read and complicate sync. A timestamp column was
considered but rejected: the product has no "when archived" requirement and a
boolean is clearer (Principle VII, KISS).

**Alternatives considered**:

- Separate table (rejected — join overhead, no benefit).
- `archivedAt` timestamp (rejected — YAGNI; boolean is sufficient and clearer).

## D2. Where the archived filter lives — `languages()` vs `language()`

**Decision**: Filter archived rows **uniformly** — both `Persistence.languages()`
(the list) **and** `Persistence.language({code}|{languageId})` (single lookup)
exclude archived rows. Archived rows become invisible through the normal read
path; only the archive endpoint's dependency check and the migration touch them.

**Rationale**: This makes FR-004 (block translating into an archived language)
fall out for free. `TranslateHome` already renders `<CodeError />` when
`state.languages.translating` is null (verified in
`src/frontend/common/translate/TranslateHome.tsx`). `loadTranslatingLanguage`
calls `/api/languages/code/:code` → `storage.language({code})`; once that returns
`null` for an archived code, a direct `/translate/:code` hit shows the existing
Code_error screen with no new UI. FR-013 (redirect from an archived **detail**
URL) works off `adminLanguages` (already filtered by `languages()`), so it does
not depend on `language()` behavior either.

**Consequence to watch**: The archive endpoint must NOT rely on
`storage.language({languageId})` to read back the archived row after archiving
(it would return null). The archive flow only needs to (a) run the dependency
check against the still-active list and (b) set the flag — neither requires
reading the archived row back.

**Alternatives considered**:

- Hybrid (list filters, single lookup returns archived): rejected — it would
  require bespoke null/`archived` handling in `TranslateHome` to satisfy FR-004,
  more code for no benefit.

## D3. Archive as a dedicated endpoint reusing `updateLanguage`

**Decision**: Do **not** add a new `Persistence` method. Reuse
`updateLanguage(id, { archived: true })`. Add a dedicated server endpoint
`POST /api/admin/languages/:languageId/archive` that performs the dependency
check (D5) and then calls `storage.updateLanguage`. The existing generic update
endpoint (`POST /api/admin/languages/:languageId`) keeps its
`objFilter(req.body, ["motherTongue", "defaultSrcLang"])` allow-list, so
`archived` can never be set (or cleared) through it — this is what enforces
FR-006 (no in-product un-archive) at the API layer.

**Rationale**: Principle VII (simplicity, DRY) — `updateLanguage` already accepts
`Partial<Language>` and is implemented across `PGStorage`, `testStorage`, and
(by inheritance) `PGTestStorage`/`TransactionalTestStorage`. A dedicated endpoint
is still required because archiving is a **gated** action (dependency check +
confirmation), unlike a plain field update.

**Alternatives considered**:

- New `Persistence.archiveLanguage(id)` method (rejected — expands the interface
  surface for a one-field update already expressible via `updateLanguage`; the
  gating belongs in the endpoint, not a new storage primitive).

## D4. Atomicity / race conditions (spec line 116 — server is source of truth)

**Decision**: Perform the dependency re-check and the archive write **inside a
single database transaction** in the archive endpoint's storage path. Concretely:
open a transaction, `SELECT` active languages whose `defaultSrcLang = :id` FOR the
check, and if none, `UPDATE languages SET archived = true WHERE languageId = :id`
within the same transaction; commit. The check-and-set is therefore atomic with
respect to concurrent `defaultSrcLang` re-points.

**Rationale**: The spec explicitly requires the server to be the source of truth
"to prevent race conditions." The dangerous interleaving is: admin A re-points
the last dependent onto X while admin B archives X — a two-statement
(read-then-write) implementation could archive X while a dependent still points
at it. A single transaction closes the window. Full `SERIALIZABLE` isolation is
not required for this rare admin operation; a transaction with the conditional
update (or `SELECT ... FOR UPDATE` on the candidate rows) is sufficient.

**Implementation note**: `postgres@1` (`this.sql`) supports `sql.begin(async tx
=> {...})`. The archive storage helper wraps the check + update in one
`sql.begin`. `TransactionalTestStorage` already swaps `this.sql` per test; the
archive helper must use the instance `this.sql` so it participates correctly.

**Alternatives considered**:

- Client-side-only check using already-loaded `adminLanguages` (rejected as sole
  guard — races; brainstorm already noted the server must enforce it). The client
  check is still kept as a fast pre-flight for UX, but the server transaction is
  authoritative.

## D5. Dependency check semantics

**Decision**: A language X is blocked from archiving iff at least one **active**
(non-archived) language other than X has `defaultSrcLang === X.languageId`. The
blocked response returns the names of those dependents. Because `languages()`
already excludes archived rows, iterating its result and filtering
`lang.defaultSrcLang === id && lang.languageId !== id` yields exactly the active
dependents (spec Assumption: archived→archived references are not live
dependencies; English gets no special-casing — it is simply blocked whenever
active languages still point at it).

## D6. Cold-load redirect timing (FR-011 / FR-013)

**Decision**: The detail route gates its redirect on the load-completion flag.
`useLoad(loadLanguages(true))` returns a `loading` boolean (`true` while loading
or not-yet-started — verified in `src/frontend/common/api/useLoad.ts`). The
detail component renders `<LoadingSnake />` while `loading` is true, and only
redirects to the Languages list when `!loading && language-not-found-or-archived`.

**Rationale**: On a direct hit / refresh / shared link to `/languages/:id`,
`adminLanguages` is empty on first render. Redirecting on "id not in list" before
the load resolves would break every direct link (the core trap of this feature).
Gating on `!loading` fixes it.

## D7. Route ↔ selection state sync (brainstorm R8/R9)

**Decision**: Drive `LanguagesBox`'s selected-language from the route, not local
`useState`. Add an admin-only route `/languages/:languageId` in `MainRouter.tsx`
that renders `AdminHome` (so the page chrome and other boxes are unchanged), and
have `LanguagesBox` read `useParams<{ languageId }>()`: when a `languageId` is
present, auto-unfold and render `LanguageView` for the matching active language;
clicking a language in the list calls `useNavigate()` to `/languages/:id` (instead
of `setSelectedLanguage`); the "< Languages" back button navigates to `/`
(or `/languages`). When `languageId` is present but not found in `adminLanguages`
after load completes (archived or bogus), navigate to the list (FR-013).

**Rationale**: Matches the existing flat `/lessons/:id` pattern and the spec's
chosen route shape. Rendering `AdminHome` keeps the "land directly on the detail
view" behavior (FR-011) without a separate page shell. Per the brainstorm scope
boundary, the Languages **list** page keeps no route of its own; only the detail
view gains one.

**Alternatives considered**:

- A standalone `LanguageDetailPage` outside `AdminHome` (rejected — duplicates the
  header/chrome and diverges from how the list renders today).

## D8. `archived` field: required vs optional on the `Language` type

**Decision**: Make `archived: boolean` a **required** field on the `Language`
interface (`src/core/models/Language.ts`), add it to the `isLanguage` guard's
field list, and include it in `sqlizeLang`. Update the shared frontend test
helper(s) (e.g. `src/frontend/common/testHelpers.tsx`) and fixture builders to
default `archived: false`, then fix remaining raw `Language` literals surfaced by
`yarn typecheck`.

**Rationale**: Principle II (strict type safety, no truthy/falsy) — the value is
always concretely present from storage, so an optional `boolean | undefined`
would only invite unsafe checks and istanbul-unfriendly branches. The cost is a
mechanical ripple across ~20 test/fixture files carrying `Language` literals;
`sp:05-tasks` will enumerate them. `PublicLanguage = Omit<Language, "code">` will
carry `archived` too, but its value is always `false` in the public list (archived
rows are filtered out server-side), so it is harmless; no change to
`PublicLanguage`'s shape is needed.

**Alternatives considered**:

- Optional `archived?: boolean` (rejected — weaker types, strictBoolean friction;
  minor churn savings not worth it under this constitution).

## D9. Desktop sync propagation of archival — explicit NON-GOAL

**Decision**: Propagating archival to already-synced **desktop** clients is an
explicit **non-goal** of this feature and is documented as a known limitation.

**Rationale**: The sync gate keys the languages payload on `SELECT max(created)
FROM languages` (`PGStorage` ~line 307/331), i.e. on row **creation** time.
Archiving updates `modified`, not `created`, so a desktop client that has already
synced will not re-fetch the languages list and could keep offering an
archived language in its offline picker until an unrelated new-language creation
bumps the sync timestamp or a full resync occurs. Closing this would require
changing sync-trigger semantics (keying on `modified`/status), which is broader
than — and orthogonal to — the admin-web archiving flow this feature delivers.
The brainstorm's Scope Boundaries confine this feature to the admin Languages
screen and say nothing about desktop; archiving is a rare admin action and the
desktop app is the offline translator surface. FR-003's "any picker in the
system" is satisfied for all **web** pickers (admin list, public `/api/languages`
list, and the source-language `SelectInput`, all of which read through the
archived-filtering `languages()`); the desktop offline picker is out of scope.

**Follow-up (not this feature)**: If desktop propagation is later required, make
the sync languages-timestamp account for status changes (e.g. include
`max(modified)` or a dedicated archival event in the sync trigger).

## D10. Confirmation UI (FR-005)

**Decision**: Add a reusable confirmation-dialog base component under
`src/frontend/common/base-components/` (none exists today per the brainstorm),
styled per `DESIGN.md` (flat/no-shadow, `Colors.ts` palette, Helvetica scale). A
plain yes/no confirm is sufficient for FR-005 — the spec only requires an
explicit, clear confirmation that states the action cannot be undone from within
the product; a typed-name confirmation is not required. See Presentation Design
in `plan.md`.

**Rationale**: Consistency over novelty (CLAUDE.md) — build the confirm from
existing base-components (`Button`, `Div`, `Heading`) and tokens rather than
inventing a parallel modal language. Reusable because future destructive actions
will want the same pattern.
</content>
</invoke>
