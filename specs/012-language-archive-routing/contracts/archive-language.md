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

## Companion change: `defaultSrcLang` re-point validation

`POST /api/admin/languages/:languageId` (the generic update), when `req.body`
carries `defaultSrcLang`, MUST validate — inside a transaction locking the
target source-language row — that the target is an existing, **active**
language; otherwise reject (422) with no state change. This is both the other
half of the race fix and a standalone integrity guard (today the endpoint
accepts any number, including an archived or nonexistent id).

## Responses

### 200 OK — archived

Returns a minimal `{ archived: true; languageId: number }` acknowledgement — NOT
the `Language`. Reads filter archived rows, so neither the handler nor
`archiveLanguage` may re-read the row (`storage.language({languageId})` returns
`null` post-archive; this is also why `updateLanguage`, whose trailing re-read
would return null, is not used — research D3). The frontend needs no body
beyond the acknowledgement: it removes the language from `adminLanguages` by id
and navigates to the list.

### 409 Conflict — blocked by dependents (FR-008)

Body MUST name the dependent languages so the admin knows what to re-point:

```jsonc
{
  "error": "HAS_DEPENDENTS",
  "dependents": [
    { "languageId": 4, "name": "Fulfulde" },
    { "languageId": 7, "name": "Bambara" },
  ],
}
```

The frontend renders these names in the blocked message (Independent Test / US2).

### 404 Not Found

`languageId` does not correspond to an active language (already archived or does
not exist).

### 401 / 403

Non-admin request — no archive is performed and the action is not exposed (FR-014).

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
