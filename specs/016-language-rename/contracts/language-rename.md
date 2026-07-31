# Contract: Language Rename

Feature: `016-language-rename` | Date: 2026-07-31

No new endpoint. The existing generic language-update endpoint is widened by one optional field.

## `POST /api/admin/languages/:languageId`

**Auth**: admin only, via the existing `/api/admin` gating. Unchanged by this feature (FR-008).

### Path parameters

| Name         | Type   | Notes                                      |
| ------------ | ------ | ------------------------------------------ |
| `languageId` | number | Parsed with `parseInt`; unchanged behavior |

### Request body (widened)

`src/core/interfaces/Api.ts` — the `APIPost` entry changes from:

```ts
"/api/admin/languages/:languageId": [
  { languageId: number },
  { motherTongue?: boolean; defaultSrcLang?: number },
  Language,
];
```

to:

```ts
"/api/admin/languages/:languageId": [
  { languageId: number },
  { motherTongue?: boolean; defaultSrcLang?: number; name?: string },
  Language,
];
```

Server-side, the `objFilter` whitelist in `languagesController` gains `"name"`. All fields remain
optional and independently submittable; the rename client sends `{ name }` alone.

Because `req.body` is untyped at the boundary, the handler MUST narrow with an explicit runtime
guard rather than trusting the declared type. That guard is **two-step** — see immediately below; a
bare `typeof name === "string"` test is not sufficient on its own.

**Presence is not the same as validity (normative).** `objFilter` copies a whitelisted key with
`field in obj`, so it omits `name` when the key is absent but **preserves an explicit `null`**. The
handler MUST therefore test presence first and type second:

```ts
if ("name" in langUpdate) {
  if (typeof langUpdate.name !== "string") throw { status: 422 };
  // trim → empty → length/characters → duplicate
}
```

A `typeof === "string"` test used as the _presence_ test would let `{"name": null}` skip validation
entirely and reach the SQL builder as `SET name = NULL`. See plan.md D-006.

**Fields are independently submittable by construction**: a body omitting `name` produces a filtered
object with no `name` key, so `motherTongue`-only and `defaultSrcLang`-only updates keep their
current behavior byte-for-byte and pay for no extra `storage.languages()` read.

### Response

`200` with the full updated `Language` (unchanged shape). The returned `name` is the **trimmed**
value — which requires the trimmed string to be written back into the update object before the
storage call, not merely used for comparison (plan.md D-008).

### Error precedence (normative)

Evaluated strictly in this order. The first matching row wins.

| #   | Condition                                                                                     | Status | Client handling                                             |
| --- | --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| 1   | `name` key **present** and not a string (includes explicit `null`)                            | `422`  | Inline "name required" feedback; editor stays open          |
| 2   | `name.trim()` is empty                                                                        | `422`  | Inline "name required" feedback; editor stays open          |
| 2b  | `name.trim().length > 100`                                                                    | `422`  | Inline "name too long" feedback; editor stays open          |
| 2c  | `name.trim()` contains a C0/C1 control character (`U+0000-U+001F`, `U+007F-U+009F`)           | `422`  | Inline "name required" feedback; editor stays open          |
| 3   | Target `languageId` is not among the **active** languages (archived or deleted)               | `404`  | Global error banner; editor stays open with the typed value |
| 4   | Trimmed `name` case-insensitively equals another **active** language's name (`languageId !=`) | `409`  | Inline duplicate feedback; editor stays open                |
| —   | Otherwise                                                                                     | `200`  | Dispatch `addLanguage`; close the editor                    |

Rows 1, 2, 2b and 2c are all shape errors sharing status `422`; their relative order is immaterial,
but all of them precede row 3. Rows 2b/2c are new in this feature and apply to the **rename path
only** — `POST /api/admin/languages` (create) is unchanged (plan.md D-007).

**Why 3 precedes 4**: the spec requires that a rename against an archived or removed language
surface a not-found error "not a silent success". Checking duplicates first would report `409` for
an archived target whose new name collides — a misleading signal. Implementation: locate the target
inside the `storage.languages()` result; if absent, skip the duplicate comparison and let
`updateLanguageChecked` raise its existing `{ status: 404 }`.

**Self-rename**: row 4 excludes the target's own row, so re-saving the current name returns `200`
(US2 scenario 4).

**Uniqueness scope**: active languages only — archived names are not compared. This matches
`POST /api/admin/languages` (create) exactly.

### Non-goals for this contract

- No transactional/locking guarantee between the duplicate check and the write (last-write-wins per
  the spec's Assumptions).
- No DB unique constraint (see `research.md` R-001).
- No change to `POST /api/admin/languages` (create), including its existing non-trimming behavior.

## Client thunk contract

`src/frontend/common/state/languageSlice.ts`:

```ts
/** Renames a language project. Posts only `name`; other language fields are untouched. */
export function pushLanguageRename(languageId: number, name: string): Pusher<Language>;
```

- Posts `{ name }` to `/api/admin/languages/:languageId`.
- On success dispatches `languageSlice.actions.addLanguage(updatedLanguage)` — the merge that
  refreshes both the `LanguageView` heading and the admin language list without a reload (FR-004).
- Returns the updated `Language`, or `null`/`undefined` when the request failed.

Callers pass an `AppErrorHandler` to `usePush` that returns `true` for HTTP `409` and `422` (handled
inline) and `false` otherwise, so `404` and connection errors still reach the global banner —
mirroring `AddLanguageForm`'s handler.

## Desktop / sync contract

Unchanged. `updateLanguageChecked` stamps `modified`, and the existing
`/api/sync/:timestamp/languages/:languageTimestamps?` down-sync already carries `name`. Desktop
clients receive renames with no desktop-side code change (FR-010).
