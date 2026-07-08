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
  (Same body whether newly started or attached to an in-flight job. Attach vs. start is decided by a **synchronous** registry check-then-insert keyed on `(languageId, book, series, mode)`; no `await` may run between the "no live job" check and the placeholder insert, or two concurrent starts race — see data-model "Dedup atomicity", FR-010.)
- `409 Conflict` / `422 Unprocessable` — `{ "status": "failed", "reason": string, "missing"?: string[] }`
  When the quarter is incomplete at request time (missing TOC or lesson(s)) — `reason` names the missing lesson(s) (US4-1, FR-006). _(May alternatively be surfaced as a `failed` status on first poll; see note.)_
- `429 Too Many Requests` — `{ "reason": string }` (transient — **no `jobId`, no `"status": "failed"`**)
  When the in-memory job registry is at its **max live-job / queue-depth cap** (resource-bounding — see plan "Performance & Resource Bounds"). `reason` is a fixed "server busy, retry shortly" message; the client may retry after a short delay. Prevents an accidental burst of distinct-key requests from growing the queue and tmp-dir footprint without bound. The cap (like the whole registry) is **per app process**; it holds as designed only under the single-process deploy constraint recorded in data-model "Process-scoping assumption" (Pass 3) — under multiple Passenger workers the effective ceiling is N× and cross-worker dedup no longer applies.
  **Cap-vs-attach ordering (Pass 2 finding A, FR-010):** the synchronous critical section is strictly **dedup-check → (on miss) cap-check → insert**. An attach to an existing live job for `(languageId, book, series, mode)` returns that job's `202` **unconditionally** — it neither counts against nor is rejected by the cap; only a genuinely new key can be `429`'d. This preserves FR-010 (a double-click, or a normal POST-then-poll, must show the existing job's progress even when the queue is saturated).
  **429 is transient, not terminal:** the client MUST branch on **HTTP status**, not on a `status` field — a `429` is "server busy, retry shortly" and MUST NOT be rendered as a terminal `failed` job (it started no work and offers no assembly to "retry"; the client simply re-POSTs after a delay). The `"failed"` tag is reserved for a real job that ran and failed.
- `404 Not Found` — unknown language / book / series.
- `400 Bad Request` — invalid `mode`, **invalid `:book`** (must be `Luke` | `Acts` — validated against the `Book` union, not trusted from the URL), **or non-numeric `:series` / `:languageId`** (both MUST parse to finite integers; a `NaN` param is rejected here rather than silently degrading to a "missing all lessons" completeness failure — Pass 2 finding E).

**`reason` hygiene (all failure responses)**: `reason` is always drawn from a fixed vocabulary (e.g. `"missing constituent: Luke Q1 L6"`, `"a lesson failed to generate: Luke Q1 L3"`, `"assembly timed out"`, `"assembly failed (internal)"`, `"server busy, retry shortly"`). It MUST NEVER contain raw `soffice` stderr, a Node error stack, or absolute server paths — raw detail is logged server-side only (plan "Error Handling & Failure Modes").

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
  - `Content-Disposition: attachment; filename="<ascii-fallback>.odt"; filename*=UTF-8''<pct-encoded>.odt`
    (filename consistent with `documentName()` conventions; mode disambiguated).
    **Non-ASCII language names (Pass 2 finding C):** this is a translation app — `<Language>` is routinely a mother-tongue name in a non-Latin script (Arabic, Devanagari, CJK). A bare `filename="…"` param cannot carry those bytes (agents mangle/drop them or reject the header), so the handler MUST emit **both** a sanitized ASCII `filename="…"` fallback **and** an RFC 5987/6266 `filename*=UTF-8''…` parameter with the full name percent-encoded. Percent-encoding is applied **after** the existing CR/LF/quote strip (Pass 1 finding #10), so header-splitting remains prevented.
- `409 Conflict` — job exists but `status` is not `ready` (still `queued`/`running`, or `failed`) — no partial file is ever served (FR-006/FR-009).
- `404 Not Found` — unknown/expired job id, **or a `ready` job whose result file has already been pruned by the 24 h `docStorage` cleanup**. The handler MUST `stat` `resultPath` before streaming and return `404` (not a 500/stream error) when it is gone; the client maps `404` to "expired — re-request" (FR-011). The status poll (§2/§3) likewise reports `404` for a `ready` job whose file is missing, so the UI prompts a fresh assemble rather than offering a dead download.

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
