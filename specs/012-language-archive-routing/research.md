# Phase 0 Research: Language Project Archiving and Detail-View Routing

All spec `NEEDS CLARIFICATION` items and the brainstorm's "Deferred to Planning"
questions are resolved below. Each decision records the rationale and the
alternatives considered (including the ones the brainstorm already rejected, so
planning does not re-open them).

## D1. Storage representation of "archived"

**Decision**: Add a single boolean column `archived` (default `false`, NOT NULL)
to the existing `languages` table via a new node-pg-migrate-style migration file
in `migrations/`, mirroring `1583306702630-addDefaultSrcLangColumnToLanguages.js`
(`ALTER TABLE languages ADD archived boolean NOT NULL DEFAULT false` — `NOT NULL`
because a NULL `archived` would silently vanish under `WHERE NOT archived`).

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
reading the archived row back. This is also why archiving cannot reuse
`updateLanguage` (see D3): that method ends with
`return this.language({languageId: id})`, which would return `null` for a
freshly archived row, violating its `Promise<Language>` contract.

**Bonus coverage (spec edge case "translator mid-session")**: the tString write
path `POST /api/tStrings` validates via `storage.invalidCode(code, ...)`
(`tStringsController.ts`), which itself calls `this.language({code})`
(`PGStorage.ts:71-75`). Once `language()` filters archived rows, `invalidCode`
returns `true` for an archived language's code and the endpoint rejects the save
with 401 — so a translator already mid-session cannot silently save into a
just-archived language. No new code; MUST be covered by a test (archived code →
tString save rejected).

**Alternatives considered**:

- Hybrid (list filters, single lookup returns archived): rejected — it would
  require bespoke null/`archived` handling in `TranslateHome` to satisfy FR-004,
  more code for no benefit.

## D3. Archive via a new `Persistence.archiveLanguage()` method

**Decision**: Add a new `Persistence` method
`archiveLanguage(languageId: number): Promise<ArchiveLanguageResult>` that
performs the dependency check **and** the flag-set atomically inside storage
(see D4), implemented in `PGStorage` and `testStorage` (inherited by
`PGTestStorage`/`TransactionalTestStorage`). The dedicated server endpoint
`POST /api/admin/languages/:languageId/archive` calls it. The existing generic
update endpoint (`POST /api/admin/languages/:languageId`) keeps its
`objFilter(req.body, ["motherTongue", "defaultSrcLang"])` allow-list, so
`archived` can never be set (or cleared) through it — this is what enforces
FR-006 (no in-product un-archive) at the API layer.

**Rationale**: Reusing `updateLanguage(id, { archived: true })` was the original
plan, but it fails on two verified facts:

1. `PGStorage.updateLanguage` (PGStorage.ts:64-69) always executes on `this.sql`
   and takes no transaction parameter, so calling it inside a
   `sql.begin(tx => ...)` callback would run on the pooled root connection,
   **outside** the transaction — making the D4 atomicity requirement
   unimplementable through it.
2. `updateLanguage` returns `this.language({languageId: id})`, which under D2's
   uniform filter returns `null` for the row it just archived — a runtime
   violation of its `Promise<Language>` return type.

Transactions are a storage concern and the controller sees only `Persistence`,
so the atomic check-and-set must live behind the interface. The result type
carries either success or the dependent list (so the endpoint can build the 409
without a second query).

**Implementation notes**:

- `PGStorage.archiveLanguage` wraps everything in `this.sql.begin(...)` — using
  the **instance** `this.sql`, so `TransactionalTestStorage` (which swaps
  `this.sql` to the per-test transaction connection) nests it as a savepoint
  correctly.
- It must NOT re-read the archived row via `language()` (returns null post-D2);
  it returns an acknowledgement, not the `Language`.
- `testStorage.archiveLanguage` mirrors the semantics synchronously (no real
  transaction needed in-memory).

**Alternatives considered**:

- Reuse `updateLanguage` with a transaction wrapped around it (rejected — see
  the two failures above; would require adding a tx param to `updateLanguage`
  and `updateProgress`, a wider change than one new method).

## D4. Atomicity / race conditions (spec line 116 — server is source of truth)

**Decision**: `archiveLanguage` runs inside a single database transaction that
**first locks the target language row** — `SELECT ... FROM languages WHERE
languageId = :id AND NOT archived FOR UPDATE` (also serving as the
404-if-missing/already-archived check) — then computes active dependents, and
if none, `UPDATE languages SET archived = true WHERE languageId = :id`; commit.
**Symmetrically, the generic update endpoint's re-point path must validate its
new `defaultSrcLang` inside a transaction that locks the target source-language
row and confirms it is active**, rejecting the update otherwise.

**Rationale**: The spec explicitly requires the server to be the source of truth
"to prevent race conditions." The dangerous interleaving is: admin A re-points a
dependent onto X while admin B archives X. A bare transaction at READ COMMITTED
does **not** close this window: the archive's dependency check finds no matching
rows (so `FOR UPDATE` on _dependents_ locks nothing), A's re-point commits, and
B's archive proceeds — dangling reference. The two operations must contend on a
**common lock**: both lock language row X (archive locks the row it archives;
re-point locks the row it is about to point at). Then whichever commits second
observes the other's effect: archive sees the new dependent and blocks, or
re-point sees `archived = true` and rejects.

The re-point validation is also a standalone integrity fix: today
`POST /api/admin/languages/:languageId` does zero validation of
`defaultSrcLang`, so even _sequentially_ (no race), after archiving X an API
call could point a language at X — or at a nonexistent id — recreating exactly
the dangling reference this feature exists to prevent. The validation rejects a
`defaultSrcLang` that does not resolve to an active language (422/409).

**Implementation note**: `postgres@1` (`this.sql`) supports `sql.begin(async tx
=> {...})`. Both `archiveLanguage` and the re-point validation path use the
instance `this.sql` so `TransactionalTestStorage`'s per-test swapped connection
participates correctly (nested `begin` becomes a savepoint on the same
connection).

**Alternatives considered**:

- Client-side-only check using already-loaded `adminLanguages` (rejected as sole
  guard — races; brainstorm already noted the server must enforce it). The client
  check is still kept as a fast pre-flight for UX, but the server transaction is
  authoritative.
- Transaction without the common row lock (rejected — does not actually
  serialize check-and-set against concurrent re-points at READ COMMITTED, as
  described above).
- `SERIALIZABLE` isolation (rejected — heavier than needed; the row lock is
  sufficient and the operation is rare).

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
interface (`src/core/models/Language.ts`). Update the shared frontend test
helper(s) (e.g. `src/frontend/common/testHelpers.tsx`) and fixture builders to
default `archived: false`, then fix remaining raw `Language` literals surfaced by
`yarn typecheck`.

**Do NOT add `archived` to the `isLanguage` guard's field list without first
enumerating its callers.** The guard is deliberately partial today (it validates
only `name`/`code`/`languageId` of the six fields — Language.ts:25-32). If any
caller validates data persisted or synced **before** this migration (e.g.
desktop-stored rows), tightening the guard would reject previously valid data on
a surface this feature declares untouched (D9). Default: leave the guard as-is;
tighten only if a caller audit shows it is safe. `sqlizeLang` (`Language.ts:80`) has exactly one
caller, `src/server/storage/pgLoadFixtures.ts:12`
(`fixtures.languages.map(sqlizeLang)` spread into the fixture-load INSERT).
Verified this is **not** a touch point: `test/fixtures-0.json` language rows
already omit `defaultSrcLang` (a required `Language` field) today, relying on
that column's `DEFAULT 1` (`migrations/1583306702630-addDefaultSrcLangColumnToLanguages.js`)
because porsager's `sql(...)` builds each row's column list from that row's own
object keys. The new `archived boolean NOT NULL DEFAULT false` migration
follows the same pattern, so omitted fixture rows get `archived = false` for
free — `sqlizeLang` and `fixtures-0.json` need no edits (see data-model.md).

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
