# API Contract: Assembled Quarter Download

REST endpoints served by a new `assemblyController(app, storage)` registered in `serverApp.ts` beside `documentsController`. Access control is identical to per-lesson download (no new authorization — spec Assumptions). All responses are JSON except the download stream. Poll-based; status is indeterminate (`queued | running | ready | failed`).

Path params: `:languageId` (number), `:book` (`Luke` | `Acts`), `:series` (number, = Quarter). Query/body `mode` ∈ `bilingual | single-language`.

---

## 1. Start (or attach to) an assembly job

```
POST /api/languages/:languageId/quarters/:book/:series/assembly
Content-Type: application/json
Body: { "mode": "bilingual" | "single-language" }
```

Starts a background assembly for the quarter+mode, **or attaches to an existing live job** for the same `(languageId, book, series, mode)` (FR-010 — no redundant work).

**Responses**

- `202 Accepted` — `{ "jobId": string, "status": "queued" | "running" }`
  (Same body whether newly started or attached to an in-flight job.)
- `409 Conflict` / `422 Unprocessable` — `{ "status": "failed", "reason": string, "missing"?: string[] }`
  When the quarter is incomplete at request time (missing TOC or lesson(s)) — `reason` names the missing lesson(s) (US4-1, FR-006). _(May alternatively be surfaced as a `failed` status on first poll; see note.)_
- `404 Not Found` — unknown language / book / series.
- `400 Bad Request` — invalid `mode`.

**Note**: Completeness may be checked synchronously at start (returning the block immediately) **or** reported as a `failed` job on first poll. Implementation picks one and is consistent; the acceptance spec asserts the operator sees a naming message and no file either way.

---

## 2. Poll status by quarter+mode

```
GET /api/languages/:languageId/quarters/:book/:series/assembly?mode=bilingual|single-language
```

**Responses**

- `200 OK` —
  ```
  { "jobId": string, "status": "queued" | "running" }
  { "jobId": string, "status": "ready" }
  { "jobId": string, "status": "failed", "reason": string, "missing"?: string[] }
  ```
- `404 Not Found` — no job for this key (e.g. after process restart or 24 h cleanup) → the client re-requests (FR-011).

---

## 3. Poll status by job id

```
GET /api/assembly/:jobId/status
```

Same status bodies as (2); `404` if the id is unknown/expired.

---

## 4. Download the finished document

```
GET /api/assembly/:jobId/download
```

**Responses**

- `200 OK` — streams the assembled `.odt`.
  - `Content-Type: application/vnd.oasis.opendocument.text`
  - `Content-Disposition: attachment; filename="<Language>_<Book>-Q<series>-<mode>.odt"`
    (filename consistent with `documentName()` conventions; mode disambiguated).
- `409 Conflict` — job exists but `status` is not `ready` (still `queued`/`running`, or `failed`) — no partial file is ever served (FR-006/FR-009).
- `404 Not Found` — unknown/expired job id.

---

## Client interaction sketch (frontend `useAssembleQuarter`)

```
POST …/assembly {mode}          → { jobId, status }
loop GET …/assembly?mode=… every ~1–2s:
  queued|running → show "Assembling…"
  ready          → GET …/assembly/:jobId/download  (Axios blob → file-saver)
  failed         → show reason (names missing/failing lesson), offer retry (re-POST)
```

Mirrors the existing `useGetDocument` blob-download pattern; adds only the poll loop.

## Non-goals reaffirmed by this contract

- No persistent job resource (no `GET /api/assembly` list, no durable ids across restarts) — FR-011.
- No progress percentage / step count — indeterminate status only.
- No new auth endpoints or roles.
