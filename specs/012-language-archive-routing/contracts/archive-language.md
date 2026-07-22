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

## Behavior (server, atomic — research D4)

Within a single DB transaction:

1. Compute active dependents: languages `L` where `L.archived === false`,
   `L.defaultSrcLang === languageId`, and `L.languageId !== languageId`.
2. If dependents exist → **abort** the transaction; respond blocked (see below).
   No state change.
3. Else → `UPDATE languages SET archived = true WHERE languageId = :languageId`;
   commit.

The transaction guarantees the check and the set cannot be interleaved with a
concurrent `defaultSrcLang` re-point (spec line 116).

## Responses

### 200 OK — archived

Returns the updated (now-archived) `Language`, or a minimal
`{ archived: true; languageId: number }` acknowledgement. (Note: a follow-up read
via `storage.language({languageId})` would return `null` because reads filter
archived rows — the handler returns the value it already holds, it does NOT
re-read.)

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
  ArchiveLanguageResult        // response (union of ok + blocked shapes, or Language)
];
```

`ArchiveLanguageResult` (or the blocked-response shape) is a new type; the blocked
branch carries `dependents: { languageId: number; name: string }[]`.

## Un-archive

No endpoint. The generic `POST /api/admin/languages/:languageId` keeps its
`objFilter(req.body, ["motherTongue", "defaultSrcLang"])` allow-list, so `archived`
can be neither set nor cleared through it (FR-006, INV-3).
</content>
