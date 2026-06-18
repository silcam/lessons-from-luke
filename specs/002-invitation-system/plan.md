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
| Recipient redemption form (`/invitation/:token`) | US2        | Public page: pre-filled, locked email + password + display-name fields; submit → success → redirect to sign-in. Error handling branches on lookup/accept status (red-team Pass 9): `410` → terminal non-leaky "no longer valid" (FR-010); `429` → distinct **transient** "too many attempts, reload shortly" (a valid link must not read as dead); other non-200 → generic "try again" | `/design-clarify`, `/design-onboard` (first-run feel) |

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
├── serverApp.ts                          # EDIT — mount invitationController (anon routes BEFORE /api/auth/* catch-all); redact the raw token in the request logger for /api/auth/invitation/:token and /invitation/:token (red-team Pass 5)
└── jestSetupAfterEnv.ts                  # EDIT — add DELETE FROM "invitationRateLimit" (any order) and DELETE FROM "invitation" (before the scoped non-admin user delete) to afterEach (red-team Pass 12: the existing user delete is scoped `WHERE LOWER(email) != adminEmail`, not blanket)

scripts/
└── integrationTestServer.js              # EDIT (only under the dedicated-flag path — red-team Pass 12) — if the invitation limiter gates on a NEW INVITATION_RATE_LIMIT_ENFORCE flag, set it here next to BETTER_AUTH_ENFORCE_ORIGIN/RATE_LIMIT; NO edit if the limiter reuses the existing BETTER_AUTH_ENFORCE_RATE_LIMIT (preferred)

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
  the integration server via an env flag so the limit is still exercised by an integration test —
  **and that flag MUST be one the integration server actually sets (red-team Pass 12); reuse the
  existing `BETTER_AUTH_ENFORCE_RATE_LIMIT` rather than inventing an unset flag. See data-model.md
  and the Pass 12 section below.**

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

### Account-existence oracle on create (rate-limited, scoped to admins)

- **Note**: The create endpoint returns a *distinct* 409 message for "account already exists"
  (FR-004) vs "active pending invite exists" (FR-005). This is an account-enumeration oracle, but
  it is reachable **only** behind `requireAdmin`. The spec requires distinct, clear messages so
  admins can diagnose conflicts (FR-004, FR-005). **Remediated in security task 9c7.12** by adding
  the existing `invitationRateLimit` middleware to `POST /api/admin/invitations`. The same IP-based
  10-req/60s window that protects the anonymous routes now applies to the admin create route,
  bounding enumeration speed even for authenticated admins or compromised admin sessions.
  The distinct error codes (`ACCOUNT_EXISTS`, `PENDING_INVITE_EXISTS`) are preserved for admin
  usability but are no longer practical for bulk enumeration.

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
  log-leak vector. (SUPERSEDED BY PASS 5 — this conclusion is wrong; see the Pass 5 section above.
  The logger DOES run for these routes and DOES log the raw token; the in-app redaction is required.
  The deployment-note point below still stands as an additive residual.)** Pass 1 mandated "ensure
  the request logger redacts the token segment." Grounded
  against `serverApp.ts`: the `res.on("finish")` request logger is registered at **line 79**,
  *after* the better-auth catch-all (line 63). The anonymous invitation routes MUST be registered
  *before* the catch-all (Decision 1 / routing), and their handlers end the response with
  `res.json(...)` without calling `next()`, so **the line-79 logger never executes for
  `GET /api/auth/invitation/:token` or `POST .../accept`** — the Pass 1 redaction target is a no-op
  for the very routes that carry the token. Two corrections:
  1. ~~The token segment is **not** written to the in-app log at all by the current logger (the routes
     short-circuit before it), so no in-app redaction code is required for them~~ **(WRONG — superseded
     by Pass 5: the logger does run and does write the token; in-app redaction IS required.)** — **but do not add a
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

### Pass 4 — the admin state-changing routes also bypass better-auth's CSRF check

- **Threat (the Pass 1 Origin mitigation was applied to the wrong half of the surface).** Pass 1
  added an application-level Origin/Referer allow-list to the **anonymous** `accept` route, reasoning
  that any route outside `toNodeHandler` inherits none of better-auth's origin/CSRF enforcement. That
  reasoning applies **equally to the admin routes** — `POST /api/admin/invitations` and
  `POST /api/admin/invitations/{id}/retract` are plain Express handlers behind `requireAdmin`
  (cookie-session auth), registered at/after `app.use("/api/admin", requireAdmin)` (line 65),
  **not** through `toNodeHandler`. So they too perform **no application-level Origin/CSRF check**.
  Their *only* CSRF barrier is the better-auth session cookie's `sameSite` attribute. Grounded
  against `auth.ts`: the cookie `sameSite` is **not explicitly set** (better-auth's default is
  `lax`), so the protection is implicit and undocumented. A cross-origin `POST` is the higher-value
  CSRF target here than the anonymous accept route: an attacker who lands a signed-in admin on a
  malicious page forges `POST /api/admin/invitations {email: attacker@evil, role: admin}`,
  minting an **admin-role** invitation bound to an address the attacker controls — a full privilege
  path — and the admin sees nothing. The retract POST is a lesser CSRF (nuisance: kill a pending
  invite). The asymmetry (anonymous route hardened, cookie-authenticated state-changing admin routes
  not) is the gap.
- **Mitigation**: Apply the **same Origin/Referer allow-list** that Pass 1/Pass 2 defined for the
  accept route to the **state-changing admin invitation routes** (`POST /api/admin/invitations` and
  `POST /api/admin/invitations/{id}/retract`), with the identical mechanics: prefer the `Origin`
  header (key off `Origin`, fall back to `Referer`), allow-list against `BETTER_AUTH_URL` (mirroring
  `auth.ts`'s `trustedOrigins`, including the dev `:8080/:8081/:8082` relaxation and the
  `NODE_ENV=test` skip unless `BETTER_AUTH_ENFORCE_ORIGIN=1`), reject mismatch / missing-both-headers
  with `403`. Factor the Pass 1 check into a small shared middleware so the anonymous accept route and
  the admin POST routes share one implementation rather than diverging. The GET admin routes
  (`list`, re-copy `link`) are read-only and need no Origin check, but the re-copy `link` route
  **returns a working secret link**, so confirm it stays a `GET` (no state change, lax cookie does not
  authorize a cross-site read of the JSON body under the existing `default-src 'self'` / same-origin
  fetch posture) — do not convert it to a POST that would then also need the check. As a defense in
  depth, also document that the better-auth session cookie's effective `sameSite` is the implicit
  backstop, so a future change to better-auth cookie config must not loosen it to `none`.

### Pass 5 — the in-app request logger DOES leak the raw token (Pass 3's claim was wrong against the real serverApp.ts)

- **CRITICAL correction to the Pass 3 log-leak analysis.** Pass 3 asserted the `res.on("finish")`
  request logger "never executes for `GET /api/auth/invitation/:token`" because the route handlers
  "short-circuit before it" by ending the response without `next()`. **Grounded against the actual
  `src/server/serverApp.ts`, that reasoning is incorrect and the leak is real.** The path-less
  logger middleware is registered with `app.use((req, res, next) => { res.on("finish", ...); next() })`
  at the block ending the response-logging setup, and the feature's controllers (`languagesController`,
  …, and the **to-be-added `invitationController`**) are mounted *after* it. A path-less `app.use`
  logger that precedes a route runs **on every request that reaches that route** — the request first
  passes through the logger (which attaches the `finish` listener and calls `next()`), *then* reaches
  the invitation handler. The handler ending the response with `res.json(...)` and not calling
  `next()` does **not** un-register the already-attached `finish` listener — `finish` fires when the
  response completes, logging `${req.method} ${req.path} => [${res.statusCode}]`. Since
  `req.path` for the lookup route is `/api/auth/invitation/<raw-token>`, **the raw single-use token is
  written to the in-app server log on every redemption-form load.** This is exactly the in-app leak
  Pass 1 set out to prevent and Pass 3 wrongly declared a no-op.
- **Mitigation (supersedes the Pass 3 "no in-app redaction required" conclusion):**
  1. The in-app request logger MUST redact the token. Either (a) register the `invitationController`
     (or at least the anonymous `/api/auth/invitation/*` routes) **before** the logger middleware so
     they never pass through it, **or** (b) make the logger redact the `:token` path segment — e.g.
     log a fixed placeholder for any path matching `^/api/auth/invitation/[^/]+$` and for the SPA
     `/invitation/:token` route, never `req.path` verbatim. Option (b) is more robust because it also
     covers the SPA HTML route (`GET /invitation/<token>`) which the production `app.get("*", ...)`
     fallback serves and which currently would also be logged verbatim.
  2. The Pass 3 deployment note about the upstream proxy/Passenger access log still stands as the
     remaining out-of-app residual; it is **additive** to this in-app fix, not a replacement for it.
  3. Add a test asserting the in-app logger output for a redemption-form load does **not** contain the
     token (e.g. spy on `console.log` and assert the logged line for `GET /api/auth/invitation/:token`
     carries the placeholder, not the raw token), so the redaction cannot silently regress.

### Pass 6 — reconcile the Pass 3 vs Pass 5 logger dispute against the real `serverApp.ts` route order (both passes are partly wrong)

- **The Pass 3 ⇄ Pass 5 contradiction is unresolved and self-contradictory as written, and an
  implementer cannot act on it.** Pass 3 says the `res.on("finish")` logger "never executes" for the
  anonymous invitation routes; Pass 5 reverses this to "the logger DOES run … in-app redaction IS
  required" and marks Pass 3 "WRONG." Grounded against the **actual** `src/server/serverApp.ts`, the
  truth is narrower than *either* pass and depends on **which** route is in question, because the
  logger's position relative to each route is fixed by the existing file:
  1. The logger middleware is registered at **lines 78-85**, which is **after** the better-auth
     catch-all `app.all("/api/auth/*", ...)` at **line 63** and after `app.use("/api/admin", requireAdmin)`
     at line 65.
  2. The plan's own routing decision (Decision 1 / Edge Cases "Route registration vs body parsing")
     requires the **anonymous** `/api/auth/invitation/*` routes to be registered **before** the line-63
     catch-all — therefore **before** the line-78 logger. Express runs middleware in registration
     order, so a request to `GET /api/auth/invitation/:token` is matched by the invitation handler
     (registered < line 63) and that handler ends the response with `res.json(...)` **without calling
     `next()`**; the line-78 logger is never reached. **For the anonymous JSON token routes, the
     line-78 logger genuinely does NOT run — Pass 3's mechanism was correct and Pass 5's blanket
     reversal is wrong for these specific routes.** (Pass 5's general claim that "a path-less `app.use`
     logger preceding a route runs on every request" is true only when the logger precedes the route in
     registration order; here it follows the anonymous routes, so it does not.)
  3. The route that the line-78 logger **does** see with a raw token is the **production SPA HTML
     fallback** `app.get("*", ...)` at **line 99**, which serves `index.html` for
     `GET /invitation/<token>` and is registered **after** the logger. So in production the logger logs
     `GET /invitation/<raw-token> => [200]`. **This** is the real in-app leak — not the JSON API route
     Pass 5 fixated on.
- **Net correct conclusion (supersedes the conflicting parts of Pass 3 and Pass 5):**
  1. The in-app log leak is real but its surface is the **SPA HTML route** `GET /invitation/:token`
     (served by the line-99 `app.get("*")` fallback, which is after the logger), **not** the anonymous
     JSON `/api/auth/invitation/:token` route (which short-circuits before the logger). Pass 5's
     mitigation option (a) — "register the invitation controller before the logger" — is therefore a
     **no-op for the leak**, because the leaking path is the catch-all SPA route, which cannot be moved
     before the logger without breaking SPA serving.
  2. The correct fix is Pass 5's option (b) **scoped to the SPA route**: make the logger redact any
     path matching `^/invitation/[^/]+$` (and, defensively, `^/api/auth/invitation/[^/]+$` in case a
     future refactor moves those routes after the logger), emitting a fixed placeholder instead of
     `req.path`. This is a logger-level change, independent of where the invitation controller mounts.
  3. The regression test (Pass 5 item 3) MUST target the **SPA route**: assert that a
     `GET /invitation/<token>` request's logged line carries the placeholder, not the raw token
     (the prior Pass 5 test targeted the JSON route, which does not exercise the actual leak).
  4. The upstream proxy/Passenger access-log residual (Pass 3 item 2 / Pass 5 item 2) is unaffected by
     this reconciliation and still stands as an additive deployment note for **both** the `/invitation/`
     and `/api/auth/invitation/` path prefixes.
- **Origin allow-list dev/test relaxation must mirror `auth.ts`'s *actual* `trustedOrigins`, which is
  conditional on `BETTER_AUTH_URL`.** Pass 4 said the shared Origin middleware should allow-list
  "against `BETTER_AUTH_URL` … including the dev `:8080/:8081/:8082` relaxation." Grounded against
  `auth.ts`: `trustedOrigins` is `[BETTER_AUTH_URL]` **when `BETTER_AUTH_URL` is set**, and falls back
  to the `:8080/:8081/:8082` list **only when `BETTER_AUTH_URL` is unset** (and only in
  `development`). The two are mutually exclusive — the dev ports are *not* added on top of
  `BETTER_AUTH_URL`. The shared invitation Origin middleware MUST reproduce this exact precedence: if
  `BETTER_AUTH_URL` is set, allow only that origin; else if `NODE_ENV=development`, allow the three
  dev ports; else allow nothing (and rely on the `NODE_ENV=test` skip unless
  `BETTER_AUTH_ENFORCE_ORIGIN=1`). If the middleware instead always unioned the dev ports, a
  `BETTER_AUTH_URL`-configured deployment would wrongly trust `localhost:8080/8081/8082`; if it
  *never* included them, `yarn dev-web` (browser origin `:8080`, API `:8081`) would get `403` on every
  admin create/retract and the anonymous accept. Factor this into the **same** shared helper that
  produces better-auth's `trustedOrigins` (or a function that reads it) so the two cannot drift —
  rather than re-deriving the allow-list independently in the invitation middleware.

### Pass 7 — secret-bearing responses are cacheable, and the role leaks to the anonymous lookup

- **Threat: the two secret-bearing JSON responses and the SPA redemption HTML set no
  `Cache-Control`, so the bound email and the working single-use link can be retained by a cache.**
  Prior passes closed the token-in-URL leak for server logs (Pass 1/5/6) and the Referer (Pass 3),
  but never the **cache** vector. Grounded against `serverApp.ts`: the app sets no cache headers and
  the `helmet()` config emits none (helmet dropped its `noCache` middleware years ago — verified, no
  `Cache-Control` is produced). Three responses carry secrets and are currently cacheable:
  1. `GET /api/admin/invitations/{id}/link` returns the **working single-use redemption link** in its
     body. With no `Cache-Control: no-store`, a shared/forward proxy or the admin's browser disk cache
     can retain a live credential; anyone who later reads that cache obtains a usable invitation link.
  2. `GET /api/auth/invitation/{token}` returns the **bound recipient email** for a pending invite —
     a working token-to-PII oracle response that should not persist in intermediary caches.
  3. The **SPA HTML redemption page** at `GET /invitation/{token}` (served by the production
     `app.get("*", ...)` fallback) is reachable via the browser back-button / bfcache / disk cache
     after redemption, re-presenting a stale form for an already-consumed token.
- **Mitigation**: Set `Cache-Control: no-store` (and, defensively, `Pragma: no-cache`) on the two
  secret-bearing JSON responses (`.../{id}/link` and `/api/auth/invitation/{token}`) and on the
  accept response. For the SPA HTML route, rely on the redemption form re-validating the token on
  load (the `GET /api/auth/invitation/{token}` call already gates the form), so a bfcache re-display
  still cannot redeem a consumed link — but note this in the deployment residual alongside the proxy
  access-log note (Pass 3/5/6), since the HTML is served by the shared `app.get("*")` fallback and a
  per-route override there is impractical. The contract is updated to declare `Cache-Control: no-store`
  on the two GET responses and the accept response.
- **Note (corrects the Pass 5/6 regression-test target — the SPA-route log test only fires in
  production builds).** Pass 5/6 concluded the real in-app token-in-log leak is the SPA HTML route
  `GET /invitation/:token` served by `app.get("*", ...)`, and prescribed a regression test asserting
  that route's logged line carries a placeholder. Grounded against `serverApp.ts` line 97: the
  `app.get("*", ...)` SPA fallback is registered **only when `PRODUCTION`** (`NODE_ENV=production`).
  The Jest/integration harness runs under `NODE_ENV=test`, where that route does **not exist** — so a
  test that drives `GET /invitation/<token>` will hit no handler (or a 404), never exercising the
  line-78 logger against the real leaking path. The redaction regression test MUST therefore either
  (a) assert directly on the **logger middleware's redaction logic** as a unit (feed it a request
  whose `path` is `/invitation/<token>` and assert the emitted line carries the placeholder), or
  (b) construct the app with `PRODUCTION`-equivalent wiring so `app.get("*")` is mounted. A test that
  simply requests the SPA route under `NODE_ENV=test` is a **false-green** — it passes without ever
  rendering the leak. This does not change the Pass 6 fix (redact `^/invitation/[^/]+$` in the logger),
  only how it is verified.
- **The anonymous token lookup returns `role`, disclosing the pending account's privilege to the
  token-holder (Low, accepted-or-trim).** `GET /api/auth/invitation/{token}` returns `{email, role}`.
  The redemption form needs only the bound `email` to pre-fill/lock (FR-007); the granted role is
  applied server-side from the invitation row at accept and is never chosen or confirmed by the
  recipient. Returning `role` to the anonymous caller therefore discloses, to whoever holds the token,
  whether the pending account will be `admin` — with no functional need. The token-holder is the
  intended recipient, so impact is low, but the field is gratuitous: drop `role` from the lookup
  response (keep it out of the anonymous surface entirely). The contract is updated to make the lookup
  response `{email}` only.

### Pass 8 — second-order gap in Pass 7's cache hardening: the create response also returns a working link

- **Threat: Pass 7 set `Cache-Control: no-store` on the re-copy `GET /api/admin/invitations/{id}/link`
  (which returns the working single-use link) but NOT on the `POST /api/admin/invitations` `201`
  response — which returns the *same* working single-use link in its body when the invitation is first
  minted.** Pass 7 enumerated "three responses [that] carry secrets and are currently cacheable" but
  omitted the create `201`, even though its body contains exactly the credential Pass 7 was protecting
  on the re-copy path. The asymmetry is the gap: the link is `no-store` when re-copied but cacheable
  when first issued. Grounded against `serverApp.ts`: the app sets no cache headers and `helmet()`
  emits none, so the create `201` is left at the proxy/browser default. While most shared caches do not
  cache a `POST` response **by default**, a `POST` response *is* cacheable when it carries explicit
  freshness headers (RFC 9111 §4) and, more concretely here, the admin's own browser/XHR layer and any
  intermediary that has been configured to cache POST can retain the live link — the identical residual
  Pass 7 cited as its rationale for the re-copy `GET`. There is no reason to harden the re-copy of the
  link but not its original emission.
- **Mitigation**: Set `Cache-Control: no-store` (and defensively `Pragma: no-cache`) on the
  `POST /api/admin/invitations` `201` response, matching the re-copy `GET .../{id}/link` and the
  anonymous lookup/accept responses Pass 7 already hardened, so **every** response whose body carries a
  working link or the bound email is uniformly `no-store`. The contract is updated to declare
  `Cache-Control: no-store` on the create `201`. (This is the last secret-bearing JSON response on the
  invitation surface; with it, the set of `no-store` responses — create `201`, re-copy `link`,
  anonymous lookup, accept — is complete and symmetric, so a reviewer cannot find a link-bearing
  response that is still cacheable.)
- **Note (test the cache header, not just the body).** Add a controller/integration assertion that the
  create `201`, the re-copy `200`, the anonymous lookup `200`, and the accept `200` each carry
  `Cache-Control: no-store`, so the cache hardening cannot silently regress when these handlers are
  refactored (mirrors the Pass 5/6/7 stance that secret-handling invariants get an explicit guard test).

### Pass 11 — the retract `200` returns the SAME PII-bearing `InvitationSummary` the list does, but was left cacheable AND without the Pass 10 `invitedByEmail` JOIN (the "complete and symmetric" cache set is still incomplete)

- **Threat: `POST /api/admin/invitations/{id}/retract` returns a full `InvitationSummary` on
  success (contract `200`), whose body carries `email` (the bound recipient) and `invitedByEmail`
  (the creating admin) — the SAME PII the list response carries — yet Pass 7/8/10 never set
  `Cache-Control: no-store` on it.** Pass 10 declared the `no-store` set "genuinely complete (no PII-
  or secret-bearing JSON response remains cacheable)" after hardening the list, but it enumerated
  only the create `201`, list `200`, re-copy `link` `200`, anonymous lookup `200`, and accept `200`
  — it **omitted the retract `200`**, which returns one `InvitationSummary` and therefore discloses
  the same `email` + `invitedByEmail` pair Pass 10 judged worth protecting on the list. This is the
  identical asymmetry class Pass 8 closed on the create path and Pass 10 closed on the list path,
  recurring once more on the retract path: a PII-bearing response left at the proxy/browser default
  (verified again against `serverApp.ts` lines 39-61 — `helmet()` sets no cache directive, no route
  sets one). The retract response is a `POST` `200`, which most shared caches do not cache by
  default, but the admin's own browser/XHR layer and any cache configured for `POST` can retain it —
  exactly the residual Pass 8 cited as its rationale for hardening the `POST /api/admin/invitations`
  `201`. There is no principled reason the create `201` and the list `200` are `no-store` but the
  retract `200` (same `InvitationSummary` shape) is not.
- **Second, congruence: the retract handler ALSO needs the Pass 10 `invitedBy → invitedByEmail`
  JOIN, which Pass 10 specified only for the LIST query.** `InvitationSummary.invitedByEmail` is
  resolved by joining `"user"` on `invitation.invitedBy` (the row stores the admin's `user.id`, not
  their email — Pass 10). Pass 10 wrote that JOIN into the **list** query only (data-model
  "Management-list query"), but the retract `200` returns the same `InvitationSummary`, so the
  retract handler MUST perform the identical `JOIN "user" ON "user"."id" = "invitation"."invitedBy"`
  and project `"user"."email" AS "invitedByEmail"` (or reuse the same row-mapping helper) — otherwise
  it cannot populate the contract's required `invitedByEmail` field and would return a summary the
  contract does not declare. Same inner-join safety holds (`invitedBy` NOT NULL, never hard-deleted).
- **Mitigation**: (1) Set `Cache-Control: no-store` (and defensively `Pragma: no-cache`) on the
  `POST /api/admin/invitations/{id}/retract` `200` response, so **every** invitation response whose
  body carries an email or a link is uniformly `no-store` — now create `201`, list `200`, retract
  `200`, re-copy `link` `200`, anonymous lookup `200`, accept `200`; this is the genuinely complete
  set (the only remaining 2xx admin responses with a body are retract, list, and re-copy, all now
  covered). (2) Resolve `invitedByEmail` in the retract handler via the same JOIN/row-mapper used by
  the list. Extend the Pass 8/10 cache guard test to assert the retract `200` also carries
  `Cache-Control: no-store`. The contract and data-model are updated to declare the header on retract
  and to note the retract handler shares the list's `invitedBy` JOIN.

### Pass 11 — retract is a check-then-act on the invitation status with no conditional UPDATE, so it can race an in-flight accept and corrupt a terminal state

- **Threat: the accept path was given an atomic conditional status flip (Pass 1 / data-model
  "Accept transaction & lazy-expire concurrency"), but the RETRACT path was never given the
  equivalent — so retract is a TOCTOU.** The contract's retract `409` ("Invitation is not Pending")
  implies the handler checks the current status before flipping to `retracted`. If implemented as the
  natural "SELECT status → if pending → UPDATE status='retracted'", it races a concurrent
  `POST /api/auth/invitation/accept` on the same pending row: both operations read `status='pending'`;
  the accept transaction commits (creates the `user`+`account` and flips the row to `accepted`,
  `acceptedAt` set); then the retract's unconditional `UPDATE ... SET status='retracted' WHERE id=$1`
  overwrites the **already-accepted** row to `retracted`. The result is a corrupted terminal state:
  an account exists for the bound email, but the invitation reads `Retracted` with no `acceptedAt` —
  violating the state machine (no transition out of a terminal state, data-model) and the management
  list's accuracy guarantee (SC-005: status reflects reality with 100% accuracy across all
  transitions). The same race also exists between two concurrent retracts (benign — both want
  `retracted`) and, less harmfully, retract-vs-lazy-expire. The accept-vs-retract case is the
  damaging one because it can flip a `accepted` row back to `retracted`.
- **Mitigation**: Make retract a **conditional, atomic UPDATE** mirroring the accept flip:
  `UPDATE "invitation" SET status='retracted' WHERE id=$1 AND status='pending' RETURNING ...`, and
  decide the response from the row count — **1 row** → `200` (retracted, return the summary); **0
  rows** → distinguish `404` (no such id) from `409` (id exists but not pending) with a single
  follow-up existence check, or fold both into one query (e.g. `RETURNING` plus a separate cheap
  `SELECT 1 WHERE id=$1` only on the 0-row path). The status check and the write are then one atomic
  statement, so an accept that commits first leaves the row `accepted` and the racing retract matches
  **0 rows** (correctly `409`, not a silent overwrite) — exactly the single-source-of-truth pattern
  the accept path already uses. The data-model's state-machine transition rule for
  `pending → retracted` is updated to require this conditional UPDATE; add a concurrency test
  (retract racing a near-simultaneous accept on the same pending invite) asserting the row ends
  `accepted` with an account created, never `retracted`.

### Pass 11 — the create path has TWO unique constraints but blanket-maps any 23505 to the "active pending invite" 409

- **Threat: a `23505` unique-violation on the create INSERT is mapped unconditionally to FR-005
  "an active pending invitation already exists," but the `invitation` table has TWO unique
  constraints an INSERT can violate.** Data-model "Validation rules" says FR-005 is "enforced by the
  partial unique index + caught `23505` mapped to a friendly 409." But the table carries both
  `uq_invitation_one_pending_email` (partial UNIQUE on `LOWER(email) WHERE status='pending'`) **and**
  `idx_invitation_tokenHash` (UNIQUE on `tokenHash`). A blanket "any `23505` → 'active pending invite
  exists'" therefore mis-reports a `tokenHash` collision (astronomically improbable with a 256-bit
  token, but possible) as a pending-email conflict — returning a `409` that names the wrong cause and
  could confuse an admin who sees "already has a pending invite" for an email that demonstrably does
  not. It also silently swallows any future unique constraint added to the table. This is a
  correctness/error-mapping gap, not a security hole, but it undermines the "distinct, clear
  messages" the spec requires on create (FR-004/FR-005).
- **Mitigation**: The create handler MUST branch on the **constraint name** carried on the pg error
  (`error.constraint`) rather than treating every `23505` identically: a violation of
  `uq_invitation_one_pending_email` → the FR-005 `409` "active pending invitation exists"; a
  violation of `idx_invitation_tokenHash` → regenerate the token and retry the insert once (a
  collision is effectively impossible, but a retry is the correct, non-user-facing response — never
  surface it as a pending-invite conflict); any other `23505` → a generic `500`/"could not create
  invitation," not the FR-005 message. The FR-004 account-exists check stays a pre-insert `SELECT`
  (it is on the `user` table, a different table, so it never raises a `23505` on the `invitation`
  insert). The data-model "Validation rules" entry is updated to require constraint-name
  discrimination on `23505` rather than a blanket map.

### Pass 11 — the list (and create) GET/lazy-expire write means the list endpoint is not strictly "read-only" as Pass 4/10 stated

- **Note (accuracy/congruence correction to Pass 4 and Pass 10).** Pass 4 (CSRF analysis) and Pass 10
  both describe the admin GET routes — specifically `GET /api/admin/invitations` (list) — as
  "read-only," and Pass 4 uses that to justify applying the Origin/CSRF allow-list only to the
  state-changing admin POSTs and not to the GETs. But the lazy-expire mechanism (research Decision 5,
  data-model) runs a `pending → expired` `UPDATE` "on the create and list paths" — so the **list GET
  issues a DB write** and is not strictly read-only. This does **not** change the Pass 4 security
  conclusion (the list GET still needs **no** Origin check): the lazy-expire UPDATE is **idempotent
  and attacker-valueless** — it only flips already-past-due `pending` rows to `expired`, which the
  next read would do anyway, grants the caller nothing, and is gated behind `requireAdmin`. So a
  cross-origin forced GET (CSRF) achieves nothing an honest read would not. The correction is purely
  to the **characterization**: the list GET has a benign idempotent side effect, so (a) it must not
  be implemented in a way that assumes "GET ⇒ no writes" (e.g. a read-replica/route that forbids
  writes would break the lazy-expire), and (b) reviewers should not cite "read-only" as the reason no
  Origin check is needed — the real reason is the side effect is idempotent and valueless. No
  contract or data-model change; recorded so the Pass 4/10 "read-only" wording is not mistaken for a
  guarantee the implementation must preserve.

### Pass 10 — Pass 7/8 declared the cache hardening "complete and symmetric" but missed the management LIST response, which carries the largest PII surface of all

- **Threat: the admin management list `GET /api/admin/invitations` `200` returns the bound recipient
  email AND the creating-admin email for EVERY invitation, yet it is the one PII-bearing JSON
  response on the surface that Pass 7/8 left WITHOUT `Cache-Control: no-store`.** Pass 7 introduced
  cache hardening with the explicit rationale that the single bound email on the anonymous lookup is
  "token→PII … that should not persist in intermediary caches," grounded on the fact that "neither
  helmet nor the app sets cache headers" (verified again here against `serverApp.ts`: lines 39-61
  configure `helmet()` with no cache directive, and no route sets one). Pass 8 then declared the set
  of `no-store` responses "complete and symmetric … a reviewer cannot find a link-bearing response
  that is still cacheable." But Pass 7/8 scoped themselves to *link-bearing* and *single-email*
  responses and never considered the **list**, whose body (`InvitationSummary[]`) discloses, per the
  contract, `email` (every invited person's address) and `invitedByEmail` (every administrator's
  address) — a **strictly larger PII set** than the single bound email Pass 7 judged worth
  protecting. The identical vector Pass 7 cited applies a fortiori: a shared/forward proxy or the
  admin's browser disk cache can retain the full invitee/admin roster, and anyone who later reads
  that cache obtains the whole directory. The asymmetry (one bound email is `no-store`, but the bulk
  list of all bound emails plus all admin emails is cacheable) is the gap — and it is exactly the
  class of omission Pass 8 set out to close on the create-`201` path, here on the list path.
- **Mitigation**: Set `Cache-Control: no-store` (and defensively `Pragma: no-cache`) on the
  `GET /api/admin/invitations` `200` list response, so the PII-bearing list is hardened to the same
  standard as the single-email lookup (Pass 7) and the link-bearing responses (Pass 7/8). With this,
  the `no-store` set covers **every** invitation response whose body carries an email or a link —
  create `201`, list `200`, re-copy `link` `200`, anonymous lookup `200`, accept `200` — and the
  set is now genuinely complete (no PII- or secret-bearing JSON response remains cacheable). The
  contract is updated to declare `Cache-Control: no-store` on the list `200`. Extend the Pass 8 cache
  guard test to also assert the list `200` carries `Cache-Control: no-store`. (The two read-only admin
  routes that return no body PII — there are none here, since both remaining admin GETs return either
  a link or the list — so nothing else needs the header.)

### Pass 12 — the invitation rate limiter's test opt-in must use a flag the integration server actually sets, or the 429 path is untestable

- **Threat (a self-inflicted coverage hole, not an attacker vector): the Pass 2 rate-limit design
  disables the invitation limiter under `NODE_ENV=test` "except when the integration server opts in
  via `INVITATION_RATE_LIMIT_ENFORCE=1`" — but nothing sets that flag.** Grounded against
  `scripts/integrationTestServer.js` (the launcher `jestIntegrationGlobalSetup.ts` spawns for the
  whole `*.integration.test.ts` suite): it explicitly sets `BETTER_AUTH_URL`,
  `BETTER_AUTH_ENFORCE_ORIGIN=1`, and `BETTER_AUTH_ENFORCE_RATE_LIMIT=1` before constructing the app,
  precisely so better-auth's origin/CSRF and its `/sign-in/email` 429 are exercised under
  `NODE_ENV=test`. It sets **no** `INVITATION_RATE_LIMIT_ENFORCE`. Because the invitation limiter is
  **custom Express code outside better-auth**, it does not inherit `BETTER_AUTH_ENFORCE_RATE_LIMIT`;
  if it instead keys on a brand-new `INVITATION_RATE_LIMIT_ENFORCE` flag, that flag is never `1` in
  any harness, so the limiter is silently inert in every test, the contract's invitation `429`
  responses (`GET /api/auth/invitation/:token`, `POST .../accept`) are never produced under test, and
  CI is green while the abuse/DoS protection (Pass 1's whole rationale) ships unverified. This is the
  same class of "false-green" gap Pass 7 flagged for the SPA-route log test, here on the rate-limit
  path: the protection exists in the design but no test can reach it.
- **Note — the Pass 1/4/6 Origin-check test opt-in does NOT share this gap.** Those passes specify the
  invitation Origin middleware skips under `NODE_ENV=test` "unless `BETTER_AUTH_ENFORCE_ORIGIN=1`",
  reusing better-auth's existing flag — which `integrationTestServer.js` already sets. So the Origin
  `403` path *is* reachable from the integration suite as written; only the rate-limit opt-in flag was
  newly invented and left unwired. The fix below makes the rate-limit path mirror the Origin path's
  (correct) flag-reuse pattern.
- **Mitigation**: Gate the invitation rate limiter on the **same predicate `auth.ts` already uses for
  better-auth's limiter** — enforce when `process.env.NODE_ENV !== 'test' ||
  process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT === '1'`. This reuses the flag the integration server
  already sets (no new wiring, the invitation `429` is exercised by an integration test for free) and
  keeps the invitation limiter and the better-auth limiter on/off together (no second mental model).
  If a dedicated `INVITATION_RATE_LIMIT_ENFORCE` flag is preferred instead for separation of concerns,
  then **`scripts/integrationTestServer.js` MUST be edited to set it** alongside the two existing
  `BETTER_AUTH_ENFORCE_*` lines — that edit becomes a required source task (added to Project Structure
  below), because a doc-only mention will not make the flag exist. Add an integration test that drives
  the limit (>10 requests / 60s on `GET /api/auth/invitation/:token`) and asserts a `429`, so the
  limiter's effectiveness — not just its presence — is verified and cannot silently regress to inert.

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

### Pass 8 — accept creates `emailVerified: false`; FR-012 sign-in works only because verification is not required (latent coupling)

- **The accept transaction inserts `user.emailVerified = false` (data-model), and FR-012 then directs
  the recipient to sign in with the new credentials. This only works because better-auth is NOT
  configured to require email verification — a latent coupling that must be documented so a future
  change does not silently lock out every invitation-created account.** Grounded against `auth.ts`: the
  `emailAndPassword` block sets `enabled`, `disableSignUp`, `minPasswordLength`, `maxPasswordLength`,
  and the Argon2id hasher, but does **not** set `requireEmailVerification`, so it defaults to off and an
  `emailVerified: false` account can sign in immediately (the seeded admin is also `emailVerified: false`
  and signs in fine, so this is consistent and currently correct). The risk is purely forward-looking:
  if anyone later turns on `requireEmailVerification`, then (a) every account this feature creates would
  be unable to sign in right after redemption — breaking FR-012 — and (b) there is **no email-sending
  capability** in the product (a core scope boundary, brainstorm "No email sending"), so there would be
  no way to deliver a verification link, leaving the recipient permanently locked out.
- **Mitigation (document, do not change behavior).** Record this as an explicit latent constraint
  (alongside the `invitedBy`-FK "can't hard-delete an inviting admin" note): the invitation accept path
  assumes `requireEmailVerification` stays off, because the product has no email channel to satisfy
  verification. If email verification is ever desired, it is a new feature that must first add an email
  channel; until then, leaving `requireEmailVerification` unset is a precondition of this feature, not an
  oversight. No code change in this feature; `auth.ts` stays untouched (SC-008 / Principle VI). Optionally
  add a single assertion in the accept integration test that the redeemed account can actually sign in
  (FR-012 end-to-end), so a future verification-requirement change that breaks this is caught by CI rather
  than in production.

### Pass 8 — the route-scoped body parser's own errors must be handled (malformed / oversized JSON)

- **The Edge Cases section above mandates a route-scoped `bodyParser.json()` on the accept route, but
  the failure modes of that parser are unspecified.** `bodyParser.json()` *throws* on (a) malformed
  JSON (`SyntaxError`, status 400) and (b) a body over its size limit (`PayloadTooLargeError`, status
  413). Grounded against `serverApp.ts`: the app registers **no custom Express error-handling
  middleware** (no 4-arg `(err, req, res, next)` handler anywhere), so a thrown body-parse error
  propagates to Express's built-in `finalhandler`, which responds with an **HTML** error page (and, when
  `NODE_ENV !== 'production'`, the stack trace). For the anonymous accept route this is two problems:
  the response violates the contract's JSON `Error` schema (the SPA's redemption form expects JSON and
  cannot parse an HTML error), and in non-production it leaks a stack trace — both at odds with the
  feature's non-leaky-error posture (FR-010).
- **Mitigation**: The accept route MUST handle its route-scoped body-parser errors explicitly rather
  than letting them reach `finalhandler` — either by attaching a small route-scoped error handler that
  maps a body-parse `SyntaxError`/`PayloadTooLargeError` to a generic JSON `400` matching the `Error`
  schema (no stack, no parser detail), or by wrapping the parse in a try/catch in the handler. Give the
  route-scoped parser an explicit small `limit` (the accept body is tiny — `token` + a ≤128-char
  password + a ≤100-char name; e.g. `limit: '4kb'`) so an oversized body is rejected cheaply and never
  reaches the Argon2id hash (consistent with the Pass 1 "validate before hashing" ordering). Add a test
  asserting that a malformed-JSON `POST .../accept` returns a JSON `400` with the generic non-leaky
  message and no stack trace.

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

### Pass 6 — bound the `email` length on the create path

- **The `email` field has length bounds on neither the contract nor the column.** `password` (`12..128`)
  and `name` (`1..100`) are bounded, but `email` carries only `format: email` in the contract and is
  `text` (unbounded) on both `invitation.email` and `user.email`. A permissive email regex can accept a
  very long local-part/domain, so an unbounded `email` bloats the row, the `idx_invitation_email`
  /`uq_invitation_one_pending_email` indexes, and the eventual `user.email` UNIQUE index, and lands
  inside the redemption link's surrounding flow. Although create is `requireAdmin`-gated (trusted actor),
  the bound is cheap correctness/robustness: the create handler MUST reject (`400`) an `email` longer than
  a sane cap (use `254`, the RFC 5321 maximum addressable length) **before** any DB write or existence
  check. Apply the cap to the **lowercased** form so it is consistent with how the email is stored and
  compared. This is the create path only; the accept path never takes an email from the body.

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

### Pass 9 — the recipient redemption form must distinguish 429 (rate-limited) from 410 (invalid) on the lookup, or a valid link reads as "no longer valid"

- **Second-order effect of the Pass 1 rate limit on the Pass 7 lookup, on the critical redemption
  path.** `GET /api/auth/invitation/{token}` now returns three meaningful statuses: `200` (valid
  pending → render the form with the bound email), `410` (invalid — unknown/accepted/retracted/
  expired → FR-010 non-leaky "no longer valid"), and `429` (per-IP rate limit, Pass 1). The plan and
  contract specify all three on the server, but the **recipient SPA's documented behavior only
  covers the 200/410 split** (Presentation Design: "generic non-leaky error for invalid links"). If
  the redemption page treats *any* non-200 as the invalid-link state, a `429` — which is entirely
  plausible for a legitimate recipient behind a shared egress IP (office/NAT), the exact trade-off
  Pass 2 accepted — renders the FR-010 "This invitation is no longer valid" message for a link that
  is actually **valid and still redeemable**. That is a false-negative on the single most important
  conversion step (SC-002): the recipient is wrongly told their good link is dead and has no path
  forward (re-loading only burns more of the rate-limit budget). The 410 message is deliberately
  non-leaky and terminal-sounding, so it is the *worst* copy to show for a transient throttle.
- **Mitigation**: The `RedeemInvitation` page MUST branch on the lookup status, not collapse all
  failures into the invalid-link state: `410` → the existing non-leaky "no longer valid" terminal
  message (no retry affordance, FR-010); `429` → a **distinct, transient** "too many attempts, please
  wait a moment and reload" message that does **not** imply the link is dead and that invites a retry
  after the window; any other non-200 (e.g. `500`/network) → a generic "try again" error, also
  distinct from the terminal invalid-link copy. The same three-way branch applies to the **accept**
  `POST` (which also returns `410` vs `429` vs `409`): a `429` on submit must not be surfaced as
  "invalid link," and a `409`/`410` on submit (retracted/expired/already-accepted while the form was
  open — the spec's "retraction/expiry during redemption" edge cases) is the genuine terminal case.
  This is a **frontend-only** finding (no contract or data-model change — the server statuses already
  exist and are correct); it closes the gap between the server's status vocabulary and the SPA's
  documented two-state error handling. Add a `RedeemInvitation` test asserting a stubbed `429` lookup
  renders the transient/retry copy, not the terminal invalid-link copy, so the distinction cannot
  silently regress into a false-negative.

### Pass 6 — `name` is the only attacker-controlled field crossing from anonymous input into stored data

- **Harden and normalize the recipient-supplied `name` at the accept boundary.** Of the two anonymous
  accept inputs, `password` is hashed (never rendered) and `email` is sourced from the invitation row
  (not the request body), so the recipient-supplied **`name` is the sole attacker-controlled value that
  is persisted verbatim** (→ `user.name`, NOT NULL) and later **rendered** in the app UI for the signed-in
  account. The contract already bounds it to `1..100` chars, but length alone is insufficient:
  1. **Trim and reject empty-after-trim.** A `name` of all whitespace passes `minLength: 1` but yields a
     blank display name. The accept handler MUST `trim()` and reject (`400`) a name that is empty after
     trimming, so `user.name` is never effectively blank.
  2. **Reject control characters / newlines.** Strip or reject ASCII control characters (incl. `\r`/`\n`)
     so a crafted name cannot inject line breaks into log output or admin-side rendering. (XSS itself is
     mitigated by React's default escaping — this app renders through React — so this is defense-in-depth
     for non-React surfaces like logs, not a primary XSS fix; note explicitly that the protection is
     React auto-escaping so no `dangerouslySetInnerHTML` is ever introduced for `user.name`.)
  3. **Validate before the Argon2id hash** (consistent with the Pass 1 ordering rule): the cheap `name`
     normalization/validation MUST run before `passwordHasher.hash`, so a malformed name never pays the
     hash cost.

## Performance Considerations

> Added by `/sp:04-red-team` (Pass 1).

- **Argon2id cost is the dominant per-accept cost** — see the rate-limit/abuse mitigation above.
  Token validation and the FR-004 account-existence check (both single indexed lookups on
  `tokenHash` / `LOWER(email)`) are negligible by comparison; ensure they run **before** the hash so
  rejected requests never pay the Argon2id cost.
- **Management list** is an unbounded `SELECT` ordered newest-first. Given FR-019 retains all
  terminal invitations forever and the spec scopes this to a low-volume internal admin tool, no
  pagination is required for MVP; but the query MUST be backed by an index usable for the ordering
  (e.g. `createdAt DESC`) and MUST `SELECT` an explicit column list that **excludes `tokenHash` and
  `tokenEnc`** so secrets never reach the list response (contract already omits them — enforce in
  the query, not just the serializer).
- **`invitedByEmail` requires a JOIN, not a bare column (Pass 10 congruence).** The contract's
  `InvitationSummary` returns `invitedByEmail` (the creating admin's email, FR-017 audit), but
  `data-model.md` stores only `invitation.invitedBy` = the admin's `user.id`. So the list query is
  **not** a single-table select of invitation columns — it MUST `JOIN "user" ON "user"."id" =
  "invitation"."invitedBy"` (an inner join is safe: `invitedBy` is `NOT NULL` with a plain FK and is
  never hard-deleted, per the FK-lifecycle note) and project `"user"."email" AS "invitedByEmail"`.
  This is recorded so `/sp:05-tasks` generates a list-query task that resolves the email rather than
  returning a raw `invitedBy` id the contract does not declare. The same explicit column list still
  excludes `tokenHash`/`tokenEnc` and (from the `user` side) selects only `email`.

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
