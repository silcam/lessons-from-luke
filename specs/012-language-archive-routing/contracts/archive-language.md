# Contract: Archive a language project

## Endpoint

`POST /api/admin/languages/:languageId/archive`

Admin-only (guarded by the existing `requireAdmin` middleware, consistent with the
other `/api/admin/languages*` routes in `languagesController.ts`). Registered in
`src/server/controllers/languagesController.ts` via `addPostHandler`, and typed in
`src/core/interfaces/Api.ts` under `PostRoutes`.

## Request

- Path param: `languageId` (number).
- Body: empty (`Record<string, never>`). The dependency check and the flag are
  server-derived; no client-supplied fields are trusted.

## Behavior (server, atomic — research D3/D4)

The endpoint calls the new `Persistence.archiveLanguage(languageId)`. In
`PGStorage`, within a single DB transaction (`this.sql.begin`):

1. **Lock the target row**: `SELECT ... FROM languages WHERE languageId =
:languageId AND NOT archived FOR UPDATE`. No row → 404 (nonexistent or
   already archived).
2. Compute active dependents: languages `L` where `L.archived === false`,
   `L.defaultSrcLang === languageId`, and `L.languageId !== languageId`.
3. If dependents exist → **abort** the transaction; respond blocked (see below).
   No state change.
4. Else → `UPDATE languages SET archived = true WHERE languageId = :languageId`;
   commit.

A transaction alone does NOT close the race with a concurrent `defaultSrcLang`
re-point (at READ COMMITTED the dependency check locks nothing when it finds no
rows). Atomicity comes from the **common row lock**: this flow locks language
row X, and the re-point path (below) locks the row it is about to point at —
whichever commits second observes the other's effect (spec line 116).

## Companion change: `defaultSrcLang` re-point validation (RT-B)

`POST /api/admin/languages/:languageId` (the generic update), when `req.body`
carries `defaultSrcLang`, MUST route the change through a **dedicated
transactional `Persistence` method** `repointDefaultSrcLang(languageId,
srcLangId)` — NOT `storage.updateLanguage`. `updateLanguage` runs on `this.sql`
with no transaction parameter (research D3), so it **cannot** host the atomic
lock-and-validate; using it degrades to a check-then-update TOCTOU that reopens
the archive/re-point race D4 exists to close (red-team RT-B).

`repointDefaultSrcLang` runs one `this.sql.begin(...)` that locks the target
source-language row (`SELECT ... WHERE languageId = :srcLangId AND NOT archived
FOR UPDATE`), rejects (422) with no state change when the target is
missing/archived, else `UPDATE languages SET defaultSrcLang = :srcLangId WHERE
languageId = :languageId`; commit. A `motherTongue`-only update keeps using
`updateLanguage`. This is both the other half of the race fix and a standalone
integrity guard (today the endpoint accepts any number, including an archived or
nonexistent id).

## Responses

The archive outcome (ok **or** blocked-by-dependents) is delivered as a **200
body** — an `ArchiveLanguageResult` discriminated union — NOT split across HTTP
status codes. Rationale (red-team RT-A): the repo convention `addPostHandler` →
`handleErrors` (`WebAPI.ts:33-43`) sends `res.status(status).send()` — an **empty
body** — for any thrown status, so a thrown 409 could not carry the `dependents`
list FR-008 requires. `PostRoutes` also types only the success body, so a
409-with-body would be untyped (Principle II) and need a bespoke handler
bypassing `addPostHandler` (Principle VII). Only the **bodiless** statuses stay
as thrown errors: 404 and 401/403.

### 200 OK — result union

`res.json(result)` where `result: ArchiveLanguageResult` is one of:

**Archived (ok branch):**

```jsonc
{ "archived": true, "languageId": 12 }
```

A minimal acknowledgement — NOT the `Language`. Reads filter archived rows, so
neither the handler nor `archiveLanguage` may re-read the row
(`storage.language({languageId})` returns `null` post-archive; this is also why
`updateLanguage`, whose trailing re-read would return null, is not used —
research D3). The frontend removes the language from `adminLanguages` by id and
navigates to the list.

**Blocked by dependents (blocked branch — FR-008):**

```jsonc
{
  "error": "HAS_DEPENDENTS",
  "dependents": [
    { "languageId": 4, "name": "Fulfulde" },
    { "languageId": 7, "name": "Bambara" },
  ],
}
```

The frontend **discriminates the union** (`"error" in result`) — it does NOT
catch an HTTP 409 — and renders these names in the blocked message, announced via
an `aria-live`/`role="alert"` region (Independent Test / US2; red-team RT-C).

### 404 Not Found

`languageId` does not correspond to an active language (already archived or does
not exist). Bodiless (thrown status).

### 401 / 403

Non-admin request — no archive is performed and the action is not exposed
(FR-014). Bodiless (thrown status).

## `Api.ts` typing

Add to the `PostRoutes` map (params, body, response):

```ts
"/api/admin/languages/:languageId/archive": [
  { languageId: number },      // path params
  Record<string, never>,       // body
  ArchiveLanguageResult        // response (union of ok-acknowledgement + blocked shapes)
];
```

`ArchiveLanguageResult` (or the blocked-response shape) is a new type; the blocked
branch carries `dependents: { languageId: number; name: string }[]`.

## Un-archive

No endpoint. The generic `POST /api/admin/languages/:languageId` keeps its
`objFilter(req.body, ["motherTongue", "defaultSrcLang"])` allow-list, so `archived`
can be neither set nor cleared through it (FR-006, INV-3).
</content>
