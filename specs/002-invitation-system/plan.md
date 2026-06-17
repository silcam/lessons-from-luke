# Implementation Plan: Invitation System

**Branch**: `002-invitation-system` | **Date**: 2026-06-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-invitation-system/spec.md`

## Summary

Give administrators a self-service way to onboard people via **admin-issued, single-use,
email-bound sign-up links**. An admin creates an invitation (bound email + role), copies its link,
and pastes it into an email they send out-of-band (the system sends no email). The recipient opens
the link, sets a password and display name, and an account is created with the invitation's role —
**even though public sign-up is globally disabled** — then is directed to sign in. A second
admin-only screen lists, re-copies, and retracts invitations.

**Technical approach** (resolving the spec's "Deferred to Planning" items, detailed in
[research.md](./research.md)):

1. **Account creation despite `disableSignUp: true`** — a custom anonymous server endpoint inserts
   `user`+credential `account` rows directly on the isolated `pg.Pool`, mirroring the
   `SeedAdminUser` migration and `auth.integration.test.ts`'s `insertNonAdminUser` helper, hashing
   the password with the existing `passwordHasher.hash` (Argon2id). `auth.ts` is **not** modified.
2. **Token/link design** — 256-bit `randomBytes` token; store only its **SHA-256 hash**
   (`tokenHash`, unique) for lookup plus an **AES-256-GCM-encrypted** copy (`tokenEnc`, keyed off
   `cookieSecret`) so the admin can re-copy the *same* link without storing plaintext. Single-use +
   expiry enforced at lookup (`status='pending' AND expiresAt > now()`).
3. **Test isolation** — `DELETE FROM "invitation"` added to the `afterEach` in
   `jestSetupAfterEnv.ts` (it is written outside the porsager test transaction).
4. **Account fields** — recipient supplies the display name → `user.name` (NOT NULL); role → `user.admin`.
5. **Duplicate-pending rule** — a **partial unique index** on `LOWER(email) WHERE status='pending'`
   makes "one active invite per email" a DB invariant (concurrency-safe) while letting re-invite
   succeed once a prior invite is terminal.

All invitation storage is **server-only auth infrastructure** on the isolated connection
(constitution Principle VI); the domain `postgres@1` driver, `PGStorage`, `core`, and the desktop
app are untouched.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-17-invitation-system-requirements.md](../brainstorms/2026-06-17-invitation-system-requirements.md)

### Key Decisions Carried Forward

- **Bound-to-email invites (not generic links)**: strongest accountability; each invite has a known
  recipient and creator → meaningful management screen. (Constraint: `invitation.email` +
  `invitation.invitedBy`.)
- **Role chosen per invite**: an invite grants `admin` or `standard`; role is set on the invitation
  row and applied to `user.admin` at accept time, via direct SQL (the only way to set `admin`,
  since `auth.ts` sets the `admin` field `input: false`).
- **14-day fixed default expiry**: stored as an absolute `expiresAt`; system-wide constant, not
  per-invite (spec assumption).
- **Soft-retain Retracted/Expired**: terminal states are kept for audit (FR-019); no hard delete.
- **Re-copyable pending link returns the ORIGINAL link**: drives the `tokenEnc` encrypted-at-rest
  column (research Decision 2) rather than rotating the token.
- **Branch stacked on `001-better-auth-migration`** (unmerged): build on its `requireAdmin`,
  `user.admin` boolean, isolated `pg.Pool`, and Argon2id `passwordHasher`.

### Deferred Questions (resolved during planning)

- Account creation while sign-up disabled → **direct SQL insert** on the isolated pool
  (research Decision 1).
- Token design / hash-not-plaintext / table schema → **SHA-256 `tokenHash` + AES-GCM `tokenEnc`**,
  partial-unique-pending index (research Decision 2).
- Test isolation → **`DELETE FROM "invitation"` in `jestSetupAfterEnv.ts` afterEach** (research Decision 3).
- Account-creation fields / display name → **recipient-supplied `name` → `user.name`** (research Decision 4).
- Duplicate-pending mechanics & re-invite → **partial unique index scoped to `pending`** (research Decision 5).

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
**Primary Dependencies**: better-auth 1.6.14 (server-only, isolated `pg` Pool), Express, `pg`
(node-postgres) for the auth pool, Node built-in `crypto` (randomBytes / sha256 / AES-256-GCM /
Argon2id via `passwordHasher`), React 16 + Redux Toolkit + React Router (web frontend),
`migrate` CLI with `migrations/_helpers.js`.
**Storage**: PostgreSQL. New auth-owned `invitation` table on the **isolated `pg.Pool`** (the same
connection better-auth uses). Domain data via porsager `postgres@1` through `Persistence` is
**untouched**.
**Testing**: Jest (`*.test.ts`, TDD) for controller/unit; `*.integration.test.ts` via
`yarn test:integration` (real compiled server, because better-auth is ESM-only); Cypress for web
E2E. Desktop Playwright suite unchanged.
**Target Platform**: Linux server (Express, Capistrano + Passenger). Web frontend only — desktop
Electron app is explicitly out of scope (FR-021).
**Project Type**: web (isomorphic four-layer: `core` / `server` / `frontend` / `desktop`).
**Performance Goals**: SC-001 create+copy < 1 min; SC-002 open→account < 2 min (human-paced, not
throughput-bound). Token lookup is a single indexed query.
**Constraints**:
- Server-only isolation (Principle VI): no invitation code in `src/core/` or the desktop path.
- `auth.ts` / better-auth config NOT modified; `disableSignUp: true` stays global (SC-008).
- Argon2id password hashing reused from `passwordHasher.ts` (consistent with seed + sign-in).
- Reuse existing `requireAdmin` gate (`/api/admin/*`) — no new authorization code (FR-020/SC-007).
- Store token hash, never plaintext (encrypted `tokenEnc` only for re-copy, keyed off `cookieSecret`).
- Link origin from `BETTER_AUTH_URL` (https-required in production by `secrets.ts`).
- New strings added as i18n keys; French may lag (spec Assumption).
**Scale/Scope**: small admin tool — a handful of admins, low invitation volume. 2 new admin
endpoints group (create/list/retract/re-copy), 2 anonymous endpoints (lookup/accept), 1 migration,
1 cleanup edit, ~2 web screens.

## Presentation Design

**Component Framework**: React 16 + the repo's `base-components` (Button, TextInput, Alert,
MiddleOfPage, Heading, PDiv, HandleKey, HeaderBar) + Redux Toolkit slices + React Router (same
stack as `PublicHome`/`AdminHome`). No DaisyUI in this codebase.
**Interaction Patterns**: Redux thunks calling the API (mirroring `authThunks.ts`); React Router
routes added to `MainRouter.tsx`; admin screen reached from the admin area, recipient screen at a
public `/invitation/:token` route.
**Accessibility Target**: match existing app conventions (labeled inputs, keyboard submit via
`HandleKey`); no formal WCAG level is tracked in this repo.

### UI Decisions

| Screen / Component                       | User Story | Approach                                                                                                   | Design Skills      |
| ---------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| Create-invitation form (email + role + copy-link result) | US1        | React form using `base-components` (TextInput, role select, Button); shows the generated link with a copy affordance; inline validation/error via `Alert` | `/design-clarify`  |
| Invitations management list (admin)      | US3        | Table/list of invitations with status, dates, creator; per-row Re-copy / Retract for Pending; empty state when none | `/design-onboard` (empty state), `/design-clarify` |
| Recipient redemption form (`/invitation/:token`) | US2        | Public page: pre-filled, locked email + password + display-name fields; submit → success → redirect to sign-in; generic non-leaky error for invalid links | `/design-clarify`, `/design-onboard` (first-run feel) |

### Quality Pass

**Design quality target**: MVP (internal admin tool; correctness and clarity over polish).
**Post-implementation refinement**: `/design-clarify` for the invalid-link and validation
microcopy (must be non-leaky, FR-010), and the empty-state copy on the management list. No
flagship polish pass planned.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Gate | Assessment |
| --- | --- | --- |
| **0. Fidelity to Reality** | No simulated progress; behavior matches spec | PASS — single-use/expiry/dup-pending enforced as real DB invariants + transactional accept, not just UI affordances. |
| **I. Test-First (TDD)** | Tests before implementation; 95%+ coverage; integration + E2E for cross-layer/UI | PASS (planned) — controller/helper unit tests (red-green-refactor), integration tests for the full ESM better-auth flow, Cypress E2E for both screens. See Acceptance Test Strategy. |
| **II. Type Safety** | strict + all flags, explicit return types, no `any`, `type` imports, 0 warnings | PASS (planned) — new server/frontend code is TS strict; role/status as string-literal unions; no `any`. The isolated pool follows the existing `pg.Pool` remap pattern. |
| **III. Code Quality** | JSDoc on public APIs; naming; import order; prettier | PASS (planned) — JSDoc on controller/helpers; PascalCase types; conventional structure. |
| **IV. Pre-commit Gates** | typecheck + lint-staged + related tests; conventional commits | PASS — standard pipeline; `/commit` skill used at end. |
| **V. Warnings** | zero tolerance | PASS (planned). |
| **VI. Layered Architecture / Server-only exemption** | domain data via `Persistence`; server-only auth infra may own its storage; isomorphic `core` & desktop untouched | PASS — `invitation` is auth infrastructure on the isolated `pg.Pool` (exemption explicitly covers this); **nothing** added to `src/core/` or the desktop path; domain driver untouched (FR-022, SC-009). |
| **VII. Simplicity** | YAGNI/KISS/DRY | PASS — reuses existing `requireAdmin`, `passwordHasher`, migration helper, and direct-insert pattern; rejects the heavier better-auth admin plugin and any cron job (research). |

**Result**: PASS — no violations. Complexity Tracking section omitted (nothing to justify).

One deliberate, justified nuance recorded for red-team: the `tokenEnc` (encrypted-at-rest token for
re-copy) is slightly more than the bare "store only a hash" instruction, but it is the minimum
needed to satisfy the product requirement that re-copy returns the *same* link (FR-016 +
spec assumption) without storing plaintext. The rotate-on-recopy alternative (drop `tokenEnc`) is
documented in research.md Decision 2 as the fallback if red-team prefers strictly-hash-only storage.

## Project Structure

### Documentation (this feature)

```text
specs/002-invitation-system/
├── plan.md              # This file
├── research.md          # Phase 0 — the 5 deferred decisions resolved
├── data-model.md        # Phase 1 — invitation table + user/account at accept
├── quickstart.md        # Phase 1 — end-to-end walkthrough + test commands
├── contracts/
│   └── invitation-api.yaml  # Phase 1 — OpenAPI for the 4 endpoint groups
└── tasks.md             # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
migrations/
├── <timestamp>-AddInvitationTable.js          # NEW — invitation table + indexes (mirrors AddBetterAuthTables.js)
└── <timestamp>-AddInvitationRateLimitTable.js  # NEW — invitationRateLimit table for anonymous-route per-IP limiting

src/server/
├── auth/
│   ├── invitationTokens.ts               # NEW — generate token, sha256 hash, AES-GCM encrypt/decrypt
│   ├── invitationTokens.test.ts          # NEW — pure helper unit tests
│   ├── invitationStore.ts                # NEW — auth-pool data access (create/list/lookup/retract/accept)
│   ├── invitationStore.test.ts           # NEW
│   └── invitation.integration.test.ts    # NEW — full create→redeem→reuse/retract/expire on real server
├── controllers/
│   ├── invitationController.ts           # NEW — /api/admin/invitations* + /api/auth/invitation/*
│   └── invitationController.test.ts      # NEW — 401/403/201/409/410 controller tests
├── serverApp.ts                          # EDIT — mount invitationController (anon routes BEFORE /api/auth/* catch-all)
└── jestSetupAfterEnv.ts                  # EDIT — add DELETE FROM "invitationRateLimit" (any order) and DELETE FROM "invitation" (before user delete) to afterEach

src/frontend/web/
├── invitations/                          # NEW — admin create form + management list
│   ├── CreateInvitation.tsx (+ .test.tsx)
│   ├── InvitationsList.tsx  (+ .test.tsx)
│   └── invitationThunks.ts  (+ .test.ts)  # mirrors auth/authThunks.ts
├── auth/
│   └── RedeemInvitation.tsx (+ .test.tsx) # NEW — recipient /invitation/:token form
└── MainRouter.tsx                        # EDIT — add /invitation/:token (public) + admin invitations route

src/core/i18n/locales/
├── en.ts                                 # EDIT — new keyed strings (invitation UI)
└── fr.ts                                 # EDIT (optional) — French overrides may lag

cypress/integration/                      # NEW — E2E for issue + redeem + manage flows
```

**Structure Decision**: Web application within the existing isomorphic four-layer monorepo. Server
invitation logic lives under `src/server/auth/` and `src/server/controllers/` (server-only,
isolated pool — Principle VI). Frontend screens live under `src/frontend/web/` only (no `common/`,
no desktop). Migration follows the existing `migrations/` convention. **No files are added to
`src/core/` except i18n string keys**, and none to `src/desktop/` (FR-021/FR-022/SC-009).

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios will get an acceptance spec file
> created during `sp:05-tasks`, in `specs/acceptance-specs/`, in the GWT format consumed by the
> pipeline. Listed here for that phase to create.

| User Story                          | Acceptance Spec File                                       | Scenarios |
| ----------------------------------- | --------------------------------------------------------- | --------- |
| US1: Issue an invitation            | `specs/acceptance-specs/US06-issue-invitation.txt`        | 5         |
| US2: Redeem an invitation           | `specs/acceptance-specs/US07-redeem-invitation.txt`       | 5         |
| US3: Manage outstanding invitations | `specs/acceptance-specs/US08-manage-invitations.txt`      | 4         |

> Note: `specs/acceptance-specs/` already contains `US01`–`US05` from `001-better-auth-migration`.
> This feature's stories are numbered `US06`–`US08` to avoid filename collisions in the shared
> acceptance-specs directory. Scenario counts come from the spec's Acceptance Scenarios per story.

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Security Considerations

> Added by `/sp:04-red-team` (Pass 1). These harden the design against attacker/abuse scenarios
> the base plan did not yet address. The custom invitation Express routes are **not** handled by
> better-auth's `toNodeHandler`, so they inherit **none** of better-auth's built-in protections
> (origin/CSRF enforcement, rate limiting). Each protection below must be supplied explicitly.

### Origin / CSRF protection on the anonymous accept endpoint

- **Threat**: `POST /api/auth/invitation/accept` and `GET /api/auth/invitation/:token` are mounted
  as plain Express routes registered *before* the `app.all("/api/auth/*", toNodeHandler(...))`
  catch-all. They therefore bypass better-auth's `trustedOrigins` / `disableOriginCheck`
  enforcement (which only applies inside `toNodeHandler`). A malicious page on any origin can issue
  a cross-origin `POST` that creates an account from a known/guessed token (account-creation CSRF),
  and the recipient never consented to the password/name chosen by the attacker.
- **Mitigation**: The accept endpoint MUST perform its own **Origin/Referer allow-list check**
  against `BETTER_AUTH_URL` (mirroring `auth.ts`'s `trustedOrigins` set, with the same
  dev/test relaxations: trust `:8080/:8081/:8082` in development, skip under `NODE_ENV=test`
  unless `BETTER_AUTH_ENFORCE_ORIGIN=1`). Reject mismatched origins with `403`. Because the token is
  the sole authorization, this is the only barrier preventing forged cross-origin redemption.

### Rate limiting / abuse of the anonymous token endpoints

- **Threat**: The custom routes do not pass through better-auth's DB-backed rate limiter (its
  `customRules` only cover `/sign-in/email`). `POST /api/auth/invitation/accept` runs a
  **deliberately CPU-expensive Argon2id hash** on every request that passes validation, so an
  attacker can amplify a small request stream into heavy CPU load (resource-exhaustion DoS) under
  Passenger's worker pool. `GET /api/auth/invitation/:token` is a cheap token-validity oracle that
  is trivially hammerable without a rate limit.
- **Mitigation**: Add an explicit, DB-backed (shared across Passenger workers) rate limit on both
  anonymous invitation routes — a small per-IP window (e.g. ≤10 requests / 60s, matching the
  existing `/sign-in/email` rule shape). **Validate the token and the password length bounds
  *before* invoking `passwordHasher.hash`** so an invalid/expired token or an out-of-bounds password
  never reaches Argon2id. Disabled under `NODE_ENV=test` (as the better-auth limiter is), gated on by
  the integration server via an env flag so the limit is still exercised by an integration test.

### Token confidentiality in transit, logs, and Referer

- **Threat**: The single-use token travels in the **URL path** (`/invitation/<token>` and
  `GET /api/auth/invitation/:token`). The existing request logger in `serverApp.ts` logs
  `req.path`, which would write live tokens into server logs; and the recipient's browser sends the
  full URL in the `Referer` header to any third-party sub-resource the redemption page loads.
- **Mitigation**: (1) Ensure no in-app request logger writes the raw token for
  `/api/auth/invitation/:token` (and the SPA `/invitation/:token` route) — log a placeholder, never
  the raw token. **(Refined in Pass 3:** the existing `serverApp.ts` logger at line 79 runs *after*
  the better-auth catch-all and so never fires for the anonymous invitation routes, which short-circuit
  earlier; the real residual risk is the upstream proxy/Passenger access log. See the Pass 3 note
  below.) (2) `Referrer-Policy: no-referrer` is **already applied globally** by the existing
  `helmet()` config's default — it covers the SPA HTML redemption page (the actual Referer source),
  so no bespoke per-route header is needed. **(Corrected in Pass 3** — the per-API-response
  `Referrer-Policy` originally implied here is redundant; see the Pass 3 note.) (3) The redemption
  page MUST load only same-origin sub-resources (already enforced by the existing CSP
  `default-src 'self'`), so no cross-origin Referer leak path exists. Production `BETTER_AUTH_URL` is
  https-only (existing `secrets.ts` guard), keeping the token off the wire in plaintext.

### `tokenEnc` at-rest encryption details (AES-256-GCM)

- **Threat**: `tokenEnc` re-encrypts the plaintext token at rest keyed off `cookieSecret`.
  Done naively (static/zero IV, raw secret as key) AES-GCM is catastrophically weak: IV reuse
  under GCM destroys confidentiality and integrity.
- **Mitigation**: Use a **fresh random 12-byte IV per row**, store `iv`, `authTag`, and ciphertext
  together (e.g. `iv:authTag:ciphertext`, base64) in the single `tokenEnc` column; derive the
  256-bit key from `cookieSecret` via a KDF (`crypto.scryptSync`/HKDF with a fixed feature-scoped
  salt) rather than using the raw secret bytes directly; verify the GCM auth tag on decrypt and
  treat a decrypt/auth failure on re-copy as a `409`/"link unavailable" rather than a 500. Document
  that rotating `cookieSecret` makes existing `tokenEnc` undecryptable (re-copy stops working for
  pre-rotation pending invites) — but the link itself still works because lookup uses `tokenHash`,
  so this degrades gracefully and is acceptable for a low-volume admin tool.

### Account-existence oracle on create (accepted, scoped to admins)

- **Note**: The create endpoint returns a *distinct* 409 message for "account already exists"
  (FR-004) vs "active pending invite exists" (FR-005). This is an account-enumeration oracle, but
  it is reachable **only** behind `requireAdmin` (a trusted actor), and the spec requires the
  distinct, clear messages. Accepted as-is; no change. Recorded so a later reviewer does not
  mistake it for a leak — it is intentional and access-controlled.

### Pass 2 — second-order effects of the Pass 1 mitigations

- **Prefer `Origin` over `Referer` for the CSRF allow-list.** Pass 1 mandates both an
  Origin/Referer allow-list on the accept route **and** `Referrer-Policy: no-referrer` on the
  redemption page. Those interact: `no-referrer` suppresses the `Referer` header, so the CSRF check
  MUST key on the **`Origin`** header (browsers always send `Origin` on cross-origin and same-origin
  non-GET fetch/XHR), using `Referer` only as a fallback. A request with **no `Origin` and no
  `Referer`** (e.g. a non-browser client) MUST be rejected `403` rather than allowed, so the absence
  of a header is never a bypass.
- **Rate-limit counter storage: resolved — option (a), new `invitationRateLimit` table.**
  Better-auth's own `rateLimit` table is owned and managed by better-auth; the custom Express
  routes cannot invoke better-auth's internal limiter. A dedicated auth-owned
  **`invitationRateLimit`** table on the isolated `pg.Pool` avoids coupling to better-auth's
  internal schema (Principle VI). The table has the same shape as `rateLimit` (`key text PK`,
  `count int`, `lastRequest bigint`), keyed `invitation:<ip>`. A separate migration
  `AddInvitationRateLimitTable.js` is added (single-concern, independently rollable); a matching
  `DELETE FROM "invitationRateLimit"` is added to the `afterEach` cleanup in
  `jestSetupAfterEnv.ts`. See data-model.md for the full DDL and test-isolation note.
- **Client IP must come from `req.ip` under `trust proxy`.** `serverApp.ts` sets
  `app.set("trust proxy", 1)`. The per-IP rate limit MUST derive the client address from `req.ip`
  (which honors the single trusted proxy hop / `X-Forwarded-For`), NOT from the raw socket address —
  otherwise every request appears to originate from the proxy and the limit becomes global,
  throttling all recipients at once.
- **Shared-NAT lockout trade-off (accepted).** A strict per-IP limit on `GET /api/auth/invitation/:token`
  will lock out legitimate recipients behind a shared egress IP (office/NAT). Given the low invitation
  volume and the abuse/DoS upside, keep the limit but size the window generously (the
  `≤10 / 60s` shape is fine) and surface a clear 429 message; no per-account/per-token limiting is
  needed beyond per-IP for MVP.

### Pass 3 — second-order effects of the Pass 1/Pass 2 mitigations

- **The in-app request logger never runs for the anonymous invitation routes — fix the actual
  log-leak vector.** Pass 1 mandated "ensure the request logger redacts the token segment." Grounded
  against `serverApp.ts`: the `res.on("finish")` request logger is registered at **line 79**,
  *after* the better-auth catch-all (line 63). The anonymous invitation routes MUST be registered
  *before* the catch-all (Decision 1 / routing), and their handlers end the response with
  `res.json(...)` without calling `next()`, so **the line-79 logger never executes for
  `GET /api/auth/invitation/:token` or `POST .../accept`** — the Pass 1 redaction target is a no-op
  for the very routes that carry the token. Two corrections:
  1. The token segment is **not** written to the in-app log at all by the current logger (the routes
     short-circuit before it), so no in-app redaction code is required for them — **but do not add a
     logger ahead of these routes that would reintroduce the leak.** If any future logging is added
     in front of the catch-all, it MUST redact the `/:token` segment.
  2. The **real** residual token-in-logs risk is the **upstream reverse proxy / Passenger access
     log** (nginx/Apache/Passenger log the full request line `GET /api/auth/invitation/<token>`),
     which is outside this Express app's control. Document this as a deployment note: the token lives
     in the URL path, so operators should treat invitation URLs in proxy access logs as secrets
     (short log retention, or a proxy-side path rewrite/redaction for `/api/auth/invitation/` and
     `/invitation/`). This is a known, accepted residual for a low-volume admin tool, recorded so it
     is not mistaken for an in-app bug.
- **Token-Referer protection is already satisfied globally by helmet — the per-API-response
  `Referrer-Policy` header is redundant and misdirected.** Pass 1 asked for `Referrer-Policy:
  no-referrer` "on the redemption page response." Grounded against `serverApp.ts`: the app already
  mounts `helmet({...})` without disabling `referrerPolicy`, and helmet's **default emits
  `Referrer-Policy: no-referrer` on every response** (verified). The actual Referer leak vector is
  the **SPA HTML document** at `/invitation/:token` (the browser sends `Referer` based on the page
  the user is *on*, i.e. the URL bar, not the JSON API URL); that HTML response is served by the
  existing `app.get("*", ...)` SPA fallback and already carries helmet's global `no-referrer`. So:
  no new per-route header is needed, and the `Referrer-Policy` header declared in the contract on the
  **JSON** `GET /api/auth/invitation/:token` response is ineffective for the real leak path. The
  contract is corrected (Pass 3) to note helmet's global `no-referrer` as the mechanism rather than a
  bespoke per-API header. Combined with `default-src 'self'` (same-origin sub-resources only), there
  is no cross-origin Referer path regardless.
- **`invitationRateLimit` increments MUST be concurrency-safe, and the table MUST be pruned.** Pass 2
  introduced the new `invitationRateLimit` table but left its read-modify-write unspecified. Two
  second-order gaps:
  1. **Atomic increment.** A naive "SELECT count → if < max → UPDATE count+1" has a TOCTOU race: two
     concurrent requests both read `count = max-1` and both proceed, exceeding the limit (the same
     class of bug the partial-unique-pending index avoids for invitations). The increment MUST be a
     single atomic statement — an `INSERT ... ON CONFLICT (key) DO UPDATE SET count = CASE WHEN
     lastRequest < window-start THEN 1 ELSE invitationRateLimit.count + 1 END, lastRequest = $now
     RETURNING count` — and the limit decision MUST read the **returned** post-increment `count`, so
     the check and the increment are one round-trip with no gap.
  2. **Pruning.** The table grows one row per distinct client IP and never shrinks (unlike the
     invitation table, these rows have **no audit value**, so FR-019's retain-forever does not apply).
     Prune opportunistically inside the same statement path — e.g. on each write also
     `DELETE FROM "invitationRateLimit" WHERE lastRequest < $window-start` (cheap, bounded, no cron) —
     so the table stays small. See data-model.md for the DDL note.
- **`req.ip` rate-limit key is spoofable if the app is reachable directly (accepted, documented).**
  With `app.set("trust proxy", 1)`, `req.ip` is derived from the last `X-Forwarded-For` hop. If an
  attacker can reach the Express app **directly** (bypassing the nginx/Apache/Passenger front), they
  control `X-Forwarded-For` and can rotate the rate-limit key per request, evading the per-IP limit.
  In the deployed topology the app is only reachable through the single trusted proxy, so this
  requires a network-level misconfiguration; accepted for MVP and recorded so it is not mistaken for a
  silent bypass. (Mitigation if ever needed: bind the app to localhost only and rely on the proxy, or
  add the Argon2id-cost guards from Pass 1 which already cap the per-request work regardless of key.)

## Edge Cases & Error Handling

> Added by `/sp:04-red-team` (Pass 1).

### Route registration vs body parsing (CRITICAL ordering constraint)

- In the current `serverApp.ts` the better-auth catch-all `app.all("/api/auth/*", toNodeHandler(...))`
  is registered on **line 63, before** `bodyParser.json()` on **line 64**. The anonymous invitation
  routes must be matched **before** the catch-all (so `/api/auth/invitation/*` is not swallowed by
  better-auth) **and** the `POST /accept` handler needs a **parsed JSON body**. Those two facts are
  in tension with the existing ordering and MUST be resolved explicitly:
  - Register the invitation controller's routes **before** the `app.all("/api/auth/*", ...)` line,
    **and** ensure JSON body parsing is available to the `POST /accept` handler — either by moving
    `bodyParser.json()` above both registrations, or by attaching a route-scoped
    `bodyParser.json()` directly to the `POST /api/auth/invitation/accept` handler.
  - Do **not** rely on the global `bodyParser` at line 64 for the accept route, because it runs
    after the catch-all and after the invitation routes; without this fix `req.body` is `undefined`
    and the accept handler silently fails validation.
- The integration test MUST assert that `POST /api/auth/invitation/accept` actually receives a
  parsed body (e.g. a happy-path create-account assertion), so a regression in route ordering is
  caught.

### Lazy-expire UPDATE concurrency

- The "lazy expire past-due pending rows" UPDATE (research Decision 5) can race a concurrent
  `accept` on the same row. Resolve by making the accept's status flip **conditional**
  (`UPDATE ... SET status='accepted' WHERE id=$1 AND status='pending' AND expiresAt > now()`
  inside the accept transaction) and treating a 0-row update as "invalid link" (`410`). The
  lazy-expire UPDATE on create/list is then only a display/uniqueness convenience and never the
  authority for redemption validity — the conditional accept update is the single source of truth.

### `invitedBy` foreign key lifecycle

- `invitation.invitedBy` is a NOT NULL FK → `"user"("id")`. Two consequences to encode:
  1. **Test cleanup ordering**: `jestSetupAfterEnv.ts` currently deletes `account` then `user`
     (sparing the seeded admin). The new `DELETE FROM "invitation"` MUST run **before** the
     `user` delete, or non-admin-created invitations referencing a deleted user will raise a
     `23503` FK violation and break isolation. (Invitations created by the *spared* seeded admin
     are removed by the explicit invitation delete.)
  2. **Production constraint**: an admin who has issued invitations cannot be hard-deleted while
     those rows reference them. Account management (including admin deletion) is explicitly Out of
     Scope, so this is a documented latent constraint, not a task — but the migration's FK should
     be plain `REFERENCES` (no `ON DELETE CASCADE`) so audit history (FR-019) is never silently
     destroyed by a future user deletion.

### Already-signed-in visitor redeems a link

- Spec edge case: the accept flow binds to the invitation's email, never the current session. The
  implementation MUST ignore any session cookie on `/api/auth/invitation/accept` and source email +
  role **only** from the invitation row (already in research Decision 4). Add an explicit test:
  redeem while carrying a valid admin session cookie and assert the new account uses the bound
  email and the invitation's role, not the signed-in user's identity.

### Pass 2 — case-normalization on every write, and the account-already-exists race

- **Lowercase the email on the accept insert, not just on the create check.** `user.email` carries
  better-auth's plain (case-sensitive) UNIQUE constraint; the feature's account-existence guarantees
  rely on **always** comparing/storing `LOWER(email)`. The accept transaction MUST insert
  `user.email` lowercased (matching `SeedAdminUser`), so that `Foo@x.com` and `foo@x.com` can never
  produce two accounts. The bound email already comes from the invitation row (stored lowercased),
  so this holds as long as the insert does not re-introduce mixed case from anywhere.
- **Catch the `user.email` unique violation inside the accept transaction.** Even though only one
  pending invite per email can exist, an account for the bound email is creatable by a different
  redemption racing between this request's token lookup and its user insert. The accept transaction MUST
  catch a `23505` on the `user` insert and map it to the contract's `409` ("account already
  exists"), rolling back so no orphaned `account` row or half-accepted invitation remains. This is
  the implementation backstop behind SC-003 (at most one account per invitation) and the contract's
  accept `409`.

## Performance Considerations

> Added by `/sp:04-red-team` (Pass 1).

- **Argon2id cost is the dominant per-accept cost** — see the rate-limit/abuse mitigation above.
  Token validation and the FR-004 account-existence check (both single indexed lookups on
  `tokenHash` / `LOWER(email)`) are negligible by comparison; ensure they run **before** the hash so
  rejected requests never pay the Argon2id cost.
- **Management list** is an unbounded `SELECT *` ordered newest-first. Given FR-019 retains all
  terminal invitations forever and the spec scopes this to a low-volume internal admin tool, no
  pagination is required for MVP; but the query MUST be backed by an index usable for the ordering
  (e.g. `createdAt DESC`) and MUST `SELECT` an explicit column list that **excludes `tokenHash` and
  `tokenEnc`** so secrets never reach the list response (contract already omits them — enforce in
  the query, not just the serializer).

## Accessibility Requirements

> Added by `/sp:04-red-team` (Pass 1). Matches the repo's existing convention (labeled inputs,
> `HandleKey` keyboard submit); no formal WCAG level is tracked here.

- **Locked email field**: the pre-filled, non-editable bound email (FR-007) MUST remain
  programmatically associated with a visible label and be conveyed to assistive tech as read-only
  (prefer `readonly` over `disabled` so the value is still announced and submitted, and the field
  stays in the tab order with an explanation that it cannot be changed).
- **Invalid-link / error messaging**: the non-leaky invalid-link message (FR-010) and inline
  validation errors MUST be associated with their controls (`aria-describedby`) and announced
  (e.g. an `Alert`/`role="alert"` region) so screen-reader users perceive the failure, not just a
  visual color change.
- **Copy-link affordance**: the create-invitation "copy link" control MUST be a real, keyboard-
  operable button with an accessible name, and the copy-success acknowledgement MUST be announced
  (live region) rather than communicated by color/icon alone.
- **Management list semantics**: render the invitations list as a real table with header cells (or
  an equivalent ARIA structure) so status/role/dates are navigable; the empty state MUST be text
  content, not an image-only state.

## Applied Learnings

_Reviewed `.specify/solutions/`; its only entries are `tooling/` workflow-harness learnings (ralph,
spec-kit phases, Claude CLI) with no relevance to this feature's auth/postgres/migration/React
stack. The `security/`, `test-coverage/`, `clean-architecture/`, and `type-safety/` categories have
no solution files. No applicable preventions — section retained empty intentionally._

## Complexity Tracking

> No constitution violations — section intentionally empty.
