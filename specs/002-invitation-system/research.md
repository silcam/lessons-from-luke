# Research: Invitation System

**Feature**: `002-invitation-system` | **Date**: 2026-06-17
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the five "Deferred to Planning" technical questions carried from the
brainstorm into the spec's Assumptions section. Each decision is recorded as
Decision / Rationale / Alternatives considered, and is grounded in the existing
`001-better-auth-migration` code (cited inline).

---

## Decision 1 — Account creation while public sign-up stays disabled (FR-011)

**Decision**: A custom server-side **`POST /api/auth/invitation/accept`** endpoint creates the
`user` + credential `account` rows **directly on the isolated `pg.Pool`**, mirroring the
`SeedAdminUser` migration and the integration test's `insertNonAdminUser` helper. It hashes the
password with the existing `passwordHasher.hash` (Argon2id) and **never** routes through
better-auth's public `sign-up/email` route (which stays `disableSignUp: true`). It does **not**
establish a session — per FR-012 the recipient is redirected to sign in afterward.

The endpoint is mounted as a plain Express route (under `/api/auth/invitation/*`, registered
**before** the better-auth catch-all `app.all("/api/auth/*", ...)` so Express matches the more
specific route first — see "Routing" below). It is intentionally **not** behind `requireAdmin`
(the recipient is anonymous), but it is gated by a valid, unredeemed, non-expired invitation
token, which is the authorization.

**Rationale**:

- The repo already creates accounts by direct SQL twice with a proven, reviewed pattern:
  `migrations/1780760814405-SeedAdminUser.js` (seed admin) and
  `src/server/auth/auth.integration.test.ts` `insertNonAdminUser()` (test users). Reusing that
  exact `user`+`account` insert shape keeps a single account-creation mental model and keeps
  Argon2id hashing consistent (`passwordHasher.hash`, format `argon2id$m$t$p$l$salt$hash`).
- `disableSignUp: true` stays globally on, satisfying SC-008 — there is no second public sign-up
  surface to police. The only new account-creation path is token-gated.
- Keeps the better-auth config untouched (`auth.ts` is not edited), minimizing blast radius on
  the unmerged `001` work and satisfying the constitution's server-only isolation (Principle VI).

**Alternatives considered**:

- **better-auth `admin` plugin `createUser`** (`/admin/create-user`): rejected. It would pull in a
  whole permission/access-control subsystem (`better-auth/dist/plugins/admin`) and its own
  `role`/`banned` columns that this feature does not need, contradicting YAGNI/KISS (Principle VII).
  It is also admin-session-gated, but the recipient redeeming a link is **not** signed in, so it
  doesn't fit the redemption actor anyway.
- **Temporarily flipping `disableSignUp` per request / `one-time-token` plugin signup**: rejected.
  Mutating global config per request is unsafe under Passenger's multiple workers, and the
  one-time-token plugin is oriented at session transfer, not account creation. Both are more
  moving parts than a direct insert that already exists in the codebase.
- **A new server-side admin "create user" capability**: out of scope — the spec explicitly defers
  account management (Out of Scope) and the recipient (not the admin) sets the password.

**Consistency requirement**: the insert MUST use `passwordHasher.hash` (not better-auth's default
scrypt) so the resulting credential verifies at sign-in, exactly as the integration test proves.
Email is stored **lowercased** (matching `SeedAdminUser` `email.toLowerCase()` and the unique
constraint on `user.email`).

---

## Decision 2 — Token / link design and the `invitation` table (FR-001, FR-009, FR-018)

**Decision**:

- **Token generation**: `crypto.randomBytes(32).toString("base64url")` → a 256-bit,
  URL-safe, single-use secret. The **plaintext token is returned to the admin once** (and is
  re-derivable only by storing it — see re-copy below) and embedded in the link
  `${BETTER_AUTH_URL}/invitation/<token>`.
- **Storage of the token**: store a **SHA-256 hash** of the token
  (`crypto.createHash("sha256").update(token).digest("hex")`) in `invitation.tokenHash`, never the
  plaintext. Lookup hashes the incoming token and matches on `tokenHash` (which is `UNIQUE`).
  SHA-256 (not Argon2id) is correct here because the token is a 256-bit high-entropy random value,
  not a low-entropy human password — a fast hash is appropriate and brute-force is infeasible.
- **Re-copy of a Pending link (FR-016)**: because we store only the hash, the original plaintext
  cannot be reconstructed. Per the spec assumption "re-copy returns the **original** link" (no
  rotation), we store the plaintext token **encrypted at rest** in a `tokenEnc` column using
  Node's `crypto` AES-256-GCM with a key derived from `secrets.cookieSecret` (already required to
  be ≥32 chars). Re-copy decrypts `tokenEnc` to rebuild the same link. The lookup path still uses
  only `tokenHash`; `tokenEnc` is only ever read by the admin re-copy endpoint. This keeps "no
  plaintext token in the clear at rest" while honoring non-rotating re-copy.
- **Single-use + expiry enforcement at lookup**: a single parameterized query selects the row by
  `tokenHash` **and** asserts `status = 'pending'` **and** `expiresAt > now()`. Anything else
  (unknown hash, accepted/retracted/expired, or past-expiry) yields the same generic "no longer
  valid" result (FR-010, non-leaky). Acceptance flips `status` to `'accepted'` inside the same
  transaction that creates the account, so a replay finds `status <> 'pending'`.
- **Table schema** (auth-owned, isolated connection — Principle VI server-only exemption):

  ```
  CREATE TABLE "invitation" (
    "id"            text        PRIMARY KEY,            -- crypto.randomUUID()
    "email"         text        NOT NULL,               -- lowercased bound recipient
    "role"          text        NOT NULL,               -- 'admin' | 'standard'
    "status"        text        NOT NULL DEFAULT 'pending', -- pending|accepted|expired|retracted
    "tokenHash"     text        NOT NULL UNIQUE,        -- sha256(token) hex
    "tokenEnc"      text        NOT NULL,               -- AES-256-GCM(token) for re-copy
    "invitedBy"     text        NOT NULL REFERENCES "user"("id"), -- creating admin (FR-017)
    "createdAt"     timestamptz NOT NULL,
    "expiresAt"     timestamptz NOT NULL,               -- createdAt + 14 days (FR-018)
    "acceptedAt"    timestamptz                          -- set on accept (FR-013)
  );
  CREATE UNIQUE INDEX "idx_invitation_tokenHash" ... (covered by UNIQUE)
  CREATE INDEX        "idx_invitation_email"  ON "invitation"(LOWER("email"));
  -- Partial unique index enforcing "at most one PENDING invite per email" (Decision 5):
  CREATE UNIQUE INDEX "uq_invitation_one_pending_email"
    ON "invitation"(LOWER("email")) WHERE "status" = 'pending';
  ```

  Migration follows the existing pattern: new file
  `migrations/<ts>-AddInvitationTable.js` using `makeDbConnect()` from `migrations/_helpers.js`,
  with `up`/`down`. Mirrors `1780760814404-AddBetterAuthTables.js`.

**Rationale**:

- Storing only the hash means a DB read (e.g. a leaked backup) cannot yield working links, except
  the deliberately encrypted `tokenEnc`, which is protected by the same secret that protects
  sessions. This is the minimum needed to satisfy both "store a hash, not plaintext" **and** the
  product requirement that re-copy returns the _same_ link (FR-016 + assumption).
- The partial unique index makes the "one active invite per email" rule a **database invariant**
  rather than a check-then-insert race (Decision 5), aligning with constitution Truth (no
  time-of-check/time-of-use gap under concurrent admin creates).
- `expiresAt` stored absolutely (not computed from a TTL at read time) makes "Expired" a pure
  function of `now()` vs a column — no background job needed (consistent with FR-019 soft-retain;
  Expired is derived, not a written row mutation, except where we surface it — see Decision 5/Expiry).

**Alternatives considered**:

- **Store plaintext token**: rejected — violates the brainstorm's explicit "store a hash, not
  plaintext."
- **Argon2id the token**: rejected — unnecessary CPU for a 256-bit random secret; SHA-256 lookup is
  O(1) and brute-force-infeasible. (Argon2id is for low-entropy passwords.)
- **Rotate the token on re-copy** (store only hash, mint a new token each re-copy): simpler
  storage (drop `tokenEnc`), but contradicts the spec assumption "re-copy returns the original
  link" and would silently invalidate a link the admin already pasted into a draft email.
  Recorded as a fallback if `tokenEnc` proves contentious in red-team.
- **better-auth `verification` table**: rejected — overloading the auth library's own table with a
  semantically different entity muddies ownership; a dedicated `invitation` table is clearer
  (Beauty/legibility) and lets us add the audit columns (`invitedBy`, `role`, `status`).

---

## Decision 3 — Test isolation for invitation rows (FR-014, FR-018)

**Decision**: Add `DELETE FROM "invitation"` to the `afterEach` cleanup block in
`src/server/jestSetupAfterEnv.ts`, in the same `authCleanupPool` transaction that already deletes
`rateLimit`, `session`, `verification`, `account`, and non-admin `user` rows. Order it **before**
the `user` delete is irrelevant (no FK from user→invitation), but place it alongside the other
auth-table deletes; the `invitedBy` FK references `user`, so delete `invitation` **before**
deleting `user` rows to avoid an FK violation. Concretely: delete `rateLimit`, `session`,
`verification`, **`invitation`**, `account`, then `user`.

**Rationale**: Invitation rows are written on the isolated `pg.Pool` **outside** the
`TransactionalTestStorage` porsager transaction (exactly like `session`/`verification`), so the
per-test rollback does not remove them. Without explicit cleanup they would leak across tests and
violate the partial-unique-pending index (Decision 5), corrupting isolation. This mirrors the
already-established pattern verbatim (`jestSetupAfterEnv.ts` lines 38–46), satisfying the
constitution's Three-isolated-environments rule.

**Alternatives considered**:

- **Truncate the table**: rejected — the existing code uses targeted `DELETE`s and spares the
  seeded admin; matching that style keeps the cleanup uniform and avoids resetting sequences.
- **Run invitation writes inside the porsager transaction**: impossible — they are on the separate
  `pg.Pool` (Principle VI server-only connection), which is the whole reason explicit cleanup
  exists for the other auth tables.

---

## Decision 4 — Account-creation field requirements / display name (FR-008)

**Decision**: The recipient supplies a **display name** on the redemption form; it is stored in the
`user.name` column. better-auth's `user` table makes `name` **NOT NULL** (see
`AddBetterAuthTables.js`: `"name" text NOT NULL`), and the seed inserts `'Admin'`. So the accept
endpoint requires a non-empty `name` in the request body and inserts it into `user.name`. The
`user.admin` boolean is set from the invitation's `role` (`role === 'admin'` → `admin = true`),
written by **direct SQL** — which is the only way to set `admin: true`, since `auth.ts` configures
the `admin` additional field with `input: false` (it can never be set through a public API).

Validation at accept time:

- `name`: required, trimmed, non-empty, length-bounded (e.g. ≤ 100 chars) to match a `text` column
  used as a display name.
- `password`: must satisfy the **same** policy better-auth enforces at sign-in — `minPasswordLength: 12`,
  `maxPasswordLength: 128` (from `auth.ts`). The accept endpoint re-validates these bounds itself
  (since it bypasses better-auth's sign-up validation) so a too-short/too-long password is rejected
  **before** hashing, mirroring the integration tests' length assertions.
- `email`: **not** taken from the request body — it is read from the invitation row (the bound,
  pre-filled, non-editable email per FR-007). The request body email, if any, is ignored to prevent
  rebinding (Edge Case: "already-signed-in visitor opens a link" / never grant to an unrelated user).

**Rationale**: Reusing better-auth's own password bounds keeps one policy. Sourcing email and role
from the server-side invitation row (never the client) closes the rebinding edge cases the spec
calls out. Setting `admin` only via direct SQL is consistent with `auth.ts`'s `input: false`
design intent.

**Alternatives considered**:

- **Admin sets the display name at creation**: rejected by the spec assumption ("The recipient
  supplies their own display name during redemption").
- **Derive `name` from the email local-part**: rejected — `name` is a user-facing display name; the
  recipient should choose it, and the form already collects it (FR-008).

---

## Decision 5 — Duplicate-pending rule mechanics and re-invite interaction (FR-005, FR-006)

**Decision**: Enforce "at most one **active (Pending, non-expired)** invitation per email" with a
**partial unique index** on `LOWER(email) WHERE status = 'pending'` (Decision 2), plus an
application-level pre-check that returns the spec's clear messages:

1. **Account already exists (FR-004)**: before creating, `SELECT 1 FROM "user" WHERE LOWER(email)
= $1` → if present, reject 409 with "an account already exists for this email"; no row written.
2. **Active pending invite exists (FR-005)**: the partial unique index rejects a second
   `pending` row for the same email at the DB layer. The controller first checks for an existing
   pending row to return a friendly 409 message; if a concurrent insert still races through, the
   unique-violation (Postgres code `23505`) is caught and mapped to the same 409 — so the invariant
   holds even under concurrency (Edge Case: concurrent creates).
3. **Re-invite after terminal (FR-006)**: because the partial index only constrains
   `status = 'pending'` rows, an `expired`/`retracted` row does **not** block a new `pending` row
   for the same email — so re-inviting succeeds once the prior invite is terminal **and** no account
   exists (the FR-004 account check still applies). No need to delete history (FR-019 soft-retain).

**Expiry surfacing**: "Pending but past `expiresAt`" is treated as Expired at **read/lookup** time
(the lookup query requires `expiresAt > now()`), so an expired-but-still-`pending` row's link
already fails (FR-018) without a background job. For the management list (FR-013/FR-014) and to let
re-invite work cleanly, the **create** path lazily transitions any past-expiry `pending` row for
that email to `status = 'expired'` (a single UPDATE) before evaluating the partial index — so a
stale pending row never falsely blocks a re-invite. The management list computes the displayed
status as `expired` when `status = 'pending' AND expiresAt <= now()`, and the same lazy-expire
UPDATE may run when the list is loaded, keeping stored state and displayed state consistent.

**Rationale**:

- A DB invariant (partial unique index) is the only way to make FR-005 hold under concurrent admin
  creates without a lock — check-then-insert alone has a TOCTOU gap (constitution Truth).
- Scoping the index to `pending` is exactly what makes FR-006 (re-invite after terminal) work for
  free, with no special-casing — the same index serves both requirements.
- Lazy expiry avoids a cron/background worker (YAGNI, Principle VII) while keeping the list honest.

**Alternatives considered**:

- **Application-only check (no index)**: rejected — TOCTOU race on concurrent creates could write
  two pending invites for one email, violating FR-005 (SC-005 accuracy).
- **A scheduled job to mark Expired**: rejected — adds operational surface; lazy-at-read +
  lazy-at-create-for-that-email is sufficient given expiry is enforced at lookup regardless.
- **Hard-delete terminal invites to simplify the uniqueness rule**: rejected — violates FR-019
  (retain for audit/history) and SC-005.

---

## Decision 6 — Rate-limit storage for anonymous invitation routes (red-team Pass 2)

**Decision**: A new **auth-owned `invitationRateLimit` table** on the isolated `pg.Pool` (option
a). The table mirrors better-auth's `rateLimit` shape (`key text PK`, `count integer`,
`lastRequest bigint`) but is owned by this feature. Keys are prefixed `invitation:<ip>`.
Window: ≤ 10 requests / 60 s per IP, keyed on `req.ip` (honoring `trust proxy = 1`).

**Rationale**: Better-auth's own `rateLimit` table is an internal implementation detail it manages
and may migrate independently. Writing to it from the invitation routes would couple this feature to
an external schema (violating Principle VI's spirit of isolation). A dedicated table is a clean
ownership boundary, supports independent rollback, and is consistent with how better-auth isolates
its own rate-limit storage. Cleanup in `jestSetupAfterEnv.ts` is a single `DELETE FROM
"invitationRateLimit"` added alongside the existing `rateLimit` delete.

**Migration**: `AddInvitationRateLimitTable.js` — a separate file from `AddInvitationTable.js`
(single-concern per migration; each rolls back independently). Both follow the existing
`makeDbConnect()` pattern from `migrations/_helpers.js`.

**Disabled in test** (consistent with the existing `rateLimit` middleware): enforcement is skipped
when `NODE_ENV=test` unless `INVITATION_RATE_LIMIT_ENFORCE=1` is set, so integration tests can
exercise the 429 path without affecting the rest of the test suite.

**Alternatives considered**:

- **Reuse `rateLimit` table with a key prefix** (option b): rejected — better-auth owns that table;
  coupling this feature to its schema risks breakage on better-auth upgrades and muddles ownership.
- **In-memory counter per worker process**: rejected — Passenger runs multiple worker processes;
  an in-memory counter is per-process and cannot enforce the limit across workers.
- **Redis**: rejected — no Redis in the stack; adding it for a low-volume admin tool violates YAGNI
  (Principle VII).

---

## Cross-cutting: Routing and admin gating

- **Admin endpoints** live under `/api/admin/invitations*` so they inherit the existing
  `app.use("/api/admin", requireAdmin)` gate (`serverApp.ts` line 65) → 401 unauth / 403 non-admin
  (FR-020, SC-007) with **zero new auth code**.
- **Recipient endpoints** (`GET` invitation by token to render the form; `POST` accept) live under
  `/api/auth/invitation/*` and are **anonymous** (token is the authorization). They MUST be
  registered **before** the better-auth catch-all `app.all("/api/auth/*", toNodeHandler)` (line 63)
  and **after** `bodyParser.json()` (line 64) for the POST. Decision: mount a small
  `invitationController(app, authPool)` that registers `GET /api/auth/invitation/:token` and
  `POST /api/auth/invitation/accept` immediately, ordering the GET/POST registration so Express's
  router matches them before the `/api/auth/*` wildcard. (Express matches routes in registration
  order; the specific invitation routes are registered first.)
- **Link origin**: built from `process.env.BETTER_AUTH_URL` (already required https in production by
  `secrets.ts`), falling back to the request origin only in dev — consistent with `auth.ts`'s
  `baseURL` handling.

## Cross-cutting: Localization

New recipient-facing and admin-facing strings are added as **keys** to
`src/core/i18n/locales/en.ts` (and the `I18nStrings` type flows to `fr.ts` via `...en` spread, so
French falls back to English until translated — exactly how `fr.ts` already partially overrides
`en`). No French copy is required to ship (spec Assumption: "full French copy may be filled in
later").

## Cross-cutting: Testing strategy

- **Unit/controller tests** (`*.test.ts`, jest, TDD red-green-refactor per Principle I): the
  invitation controller and token helpers under `src/server/auth/`, using `loggedInAgent()` /
  `plainAgent()` from `testHelper.ts` against `PGTestStorage`, with the new
  `jestSetupAfterEnv.ts` invitation cleanup. Token-hash/encrypt helpers are pure and unit-tested
  directly (100%/95% coverage target, Principle I).
- **Integration tests** (`*.integration.test.ts`, `yarn test:integration`): full create→redeem→
  reuse-rejected→retract→expire flows against the real compiled server (better-auth is ESM-only and
  must run in the child-process integration server, exactly as `auth.integration.test.ts` does).
  These cover the cross-layer behavior (better-auth session creation at sign-in after redemption)
  that the CommonJS unit runner cannot reach.
- **E2E** (Cypress, web): the admin issue-an-invitation screen and the recipient redemption screen,
  per Principle I "user-facing flows MUST be covered by end-to-end tests." Desktop Playwright suite
  is unchanged (FR-021).
