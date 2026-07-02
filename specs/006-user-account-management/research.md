# Research: User Account Management

**Feature**: `006-user-account-management` | **Date**: 2026-07-02
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves the six "Deferred to Planning" technical questions carried from the
brainstorm into the spec's Assumptions section. Each decision is recorded as
**Decision / Rationale / Alternatives considered**, grounded in the merged `001-better-auth-migration`
and `002-invitation-system` code (cited inline).

All storage described here is **server-only authentication infrastructure** on the isolated
`getAuthPool()` `pg.Pool` (constitution Principle VI server-only exemption). It MUST NOT be imported
into `src/core/` or the desktop path. The domain `postgres@1.0.2` driver and `PGStorage` are
untouched.

---

## Decision 1 — Deactivation state & enforcement point (spec §Deferred, FR-005, FR-007)

**Decision**: Add a single nullable column **`deactivatedAt timestamptz`** to the auth-owned `"user"`
table. `NULL` ⇒ **Active**; non-`NULL` ⇒ **Deactivated**. Status is **derived** from this column in
every SELECT (no separate `status`/`disabled` boolean). Reactivation sets it back to `NULL`.

Enforcement happens at **two points**, both querying the column directly on `getAuthPool()`:

1. **Sign-in rejection** — a `databaseHooks.session.create.before` hook in `auth.ts` looks up the
   target user's `deactivatedAt`; if set, it throws `APIError("UNAUTHORIZED", …)` so **no session
   row is minted** and `POST /api/auth/sign-in/email` fails. This is the authoritative "cannot sign
   in" gate (FR-005). Covered by the integration suite (real better-auth).
2. **Session-load rejection** — `loadSession()` (`src/server/middle/requireUser.ts`), after
   better-auth returns a valid session, runs `SELECT "deactivatedAt" FROM "user" WHERE id = $1`. If
   non-`NULL`, it treats the request as **unauthenticated** (leaves `req.user` unset, returns
   `null`). This handles the in-flight/already-issued session (spec Edge Case: "a request already in
   flight is treated as unauthenticated on its next evaluation") and any race window. Covered by the
   unit suite (explicit DB read is fresh regardless of the better-auth unit mock) **and** the
   integration suite.

On deactivation the store **also** `DELETE FROM "session" WHERE "userId" = $1` in the same
transaction, so existing sessions are revoked immediately (FR-005). The session-load check is
defense-in-depth for the "next request unauthenticated" guarantee even if a session row survives a
race.

**Rationale**:

- `deactivatedAt timestamptz` mirrors `002`'s derived-status pattern exactly (`invitation.retractedAt`
  / `acceptedAt` → `STATUS_CASE_SQL` in `invitationStore.ts`): one source of truth, no denormalized
  flag to drift, and it records **when** offboarding happened (audit — FR-007). "Consistency over
  novelty" (PRODUCT.md, brainstorm Key Decisions).
- An **explicit** `SELECT deactivatedAt` in `loadSession` (rather than reading a better-auth
  `additionalField`) is fresh in **all three environments** and independent of better-auth's session
  caching and of the CJS unit mock (`src/server/__mocks__/better-auth.cjs`, which caches
  `session.user` at sign-in and would not observe a mid-session deactivation). It is one extra
  primary-key lookup per authenticated request — negligible at this tens-of-accounts scale.
- `cookieCache` is **disabled by default** in better-auth 1.6.14 (verified:
  `better-auth/dist/api/routes/session.mjs` gates the cache on
  `ctx.context.options.session?.cookieCache?.enabled`, which `auth.ts` never sets), so real
  `getSession` re-reads the user row every call — the sign-in hook and the explicit load check both
  see current data.

**Alternatives considered**:

- `disabled boolean` — rejected: loses the offboarding timestamp and diverges from the `retractedAt`
  timestamp idiom already established in `002`.
- Enforce **only** at session-load (rely on the immediate `DELETE FROM session`) — rejected: a
  deactivated user with valid credentials could still `POST /sign-in/email` and receive a `200` +
  cookie, only to be 401'd on the next request. That violates the letter of FR-005 ("MUST be unable
  to sign in"). The sign-in hook makes sign-in itself fail.
- Read `deactivatedAt` via a better-auth `user.additionalFields` entry — rejected as the _primary_
  mechanism: it is fresh in production but the unit mock does not repopulate it, so unit coverage of
  the in-flight-session case would depend on mock internals. The explicit query is mock-independent.
- better-auth admin plugin `banned`/`banExpires` — rejected (see Decision 3).

---

## Decision 2 — Role-change propagation to active sessions (spec §Deferred, FR-013)

**Decision**: A role change flips the existing `user.admin` boolean in place. It **does not** revoke
or refresh sessions. Because `cookieCache` is disabled, `loadSession()` →
`getAuth().api.getSession()` re-reads `user.admin` **fresh from the DB on every request**, so a
demotion or promotion takes effect on the affected account's **next request** automatically. This
satisfies FR-013 ("MUST become effective and MUST NOT be silently lost") without a revoke step.

**Rationale**:

- Verified default-off `cookieCache` (Decision 1) means the `admin` flag carried to
  `requireAdmin`/`requireUser` is always the current DB value. A demoted admin's very next request
  reads `admin = false` and is 403'd from `/api/admin/*`; a promoted user's next request reads
  `admin = true`.
- "Next request" is strictly stronger than the spec's fallback of "next sign-in", and avoids the
  complexity and session-thrash of revoke+refresh (constitution VII, YAGNI).
- The frontend already reloads the current user via `authClient.getSession()` (`authThunks.ts`
  `loadCurrentUser`), so a client that re-fetches sees the new role too.

**Alternatives considered**:

- Revoke the target's sessions on demotion to force immediate re-auth — rejected: unnecessary given
  fresh session-load, and more disruptive (the user is signed out entirely rather than simply losing
  the admin surface). Session revocation is reserved for **deactivate** and **force-sign-out**, where
  cutting access is the actual intent.

---

## Decision 3 — Endpoint strategy: hand-roll vs. better-auth admin plugin (spec §Deferred)

**Decision**: **Hand-roll** the endpoints under the existing `/api/admin/users*` namespace, mirroring
`invitationController.ts`. Do **not** enable better-auth's admin plugin.

**Rationale**:

- The admin plugin (`node_modules/better-auth/dist/plugins/admin/`) introduces its own `role` (text)
  and `banned`/`banReason`/`banExpires` columns. Its role model **forks** the project's canonical
  `user.admin` boolean (brainstorm Key Decision: "Keep the existing `admin` boolean … do not adopt
  better-auth's admin plugin `role` string / `banned` columns"). Adopting it would create two
  sources of truth for "is this an admin" and a second offboarding concept competing with
  `deactivatedAt`.
- `002` already established the hand-rolled precedent: admin routes under `/api/admin/*` inheriting
  `app.use("/api/admin", requireAdmin)`, `requireSameOrigin` on state-changing POSTs, and a pure
  DB-access store on `getAuthPool()` (`invitationStore.ts`) with a sibling validation/error module
  (`invitationValidation.ts`). Reusing this shape keeps one mental model (constitution VII).
- The plugin's guardrails do not match ours (no "last-admin" invariant, no "no-self-deactivation"),
  so we would be overriding most of it anyway.

**Alternatives considered**:

- Enable the admin plugin and map its `role`→`admin` — rejected: schema churn, dual role model, and
  guardrails we must replace regardless.

---

## Decision 4 — Last-admin guard as a transactional count (spec §Deferred, FR-004, FR-008, FR-012)

**Decision**: Enforce "never zero admins" with **row-level locking**, not a bare count. Every guarded
mutation (demote, deactivate) runs inside a transaction that first locks the **active-admin set** with
a deterministic order:

```sql
SELECT id FROM "user"
 WHERE admin = true AND "deactivatedAt" IS NULL
 ORDER BY id
 FOR UPDATE;
```

It then counts the locked rows in application code; if the operation would remove an active admin and
the count is `≤ 1`, it `ROLLBACK`s and throws `LastAdminError`. Otherwise it performs the mutation and
`COMMIT`s.

**Rationale**:

- A bare `WHERE (SELECT count(*) …) > 1` subquery is **not** race-safe under PostgreSQL's default
  READ COMMITTED: two concurrent demotions of the last two admins each read `count = 2` at statement
  start and both succeed → zero admins (spec Edge Case: "MUST NOT allow both to succeed").
- `SELECT … FOR UPDATE` over the active-admin set serializes the guarded mutations: the second
  transaction blocks on the first's locks, and when the first commits, PostgreSQL's EvalPlanQual
  re-evaluates the second's `WHERE` against the now-committed rows. The just-demoted/deactivated row
  no longer matches `admin = true AND deactivatedAt IS NULL`, so it drops out of the locked set, the
  count becomes `1`, and the second transaction is refused. Provably never reaches zero admins.
- `ORDER BY id` pins a single, consistent lock-acquisition order across all guarded operations, so
  two concurrent guarded mutations can never deadlock.
- This reuses `002`'s "atomic conditional mutation, not SELECT-then-UPDATE" discipline
  (`retractInvitation`, `acceptInvitation` conditional UPDATEs), extended with explicit locking
  because the invariant spans **multiple rows** (the whole admin set), which a single-row conditional
  UPDATE cannot express.

**Alternatives considered**:

- `SERIALIZABLE` isolation + retry on `40001` — rejected: correct but adds serialization-failure
  retry loops everywhere; `FOR UPDATE` on the counted set is simpler and matches the existing
  conditional-mutation idiom.
- Application-level mutex — rejected: does not hold across Passenger workers (the same reason `002`'s
  rate-limit storage is DB-backed).

---

## Decision 5 — Test isolation for the new deactivation state (spec §Deferred)

**Decision**: Extend `src/server/jestSetupAfterEnv.ts`'s existing `afterEach` so that, in addition to
deleting all non-seeded users, it **resets the spared rows to their canonical state**:

```sql
UPDATE "user"
   SET "deactivatedAt" = NULL, admin = true
 WHERE LOWER(email) = $adminEmail OR id = $MOCK_USER_ID;
```

The existing `DELETE FROM "session"` (already present) revokes any sessions between tests.

**Rationale**:

- `afterEach` already `DELETE`s every user except the seeded admin (by email) and — unit suite only —
  the mock user `user-test-id`. Deleting a row resets its `deactivatedAt` implicitly, so non-spared
  users need no extra handling.
- The two **spared** rows persist across tests. A test that deactivates or demotes the seeded admin
  or the mock admin would leak that state into the next test. Resetting `deactivatedAt = NULL` and
  `admin = true` on exactly those two rows restores the canonical "one active admin exists" precondition
  that `loggedInAgent()` and the integration "exactly one admin" assertions depend on.
- `resetAuth()` already exists for pool/instance isolation; this change is purely to the row-state
  cleanup that `002` established.

**Alternatives considered**:

- A dedicated truncate/reseed of the `user` table per test — rejected: heavier than the existing
  targeted cleanup and would break the `loggedInAgent()` seeded-admin assumption.

---

## Decision 6 — Frontend data path (spec §Deferred, FR-001)

**Decision**: Use the **invitation precedent**: `createAsyncThunk` + `fetch` thunks
(`usersListThunks.ts`) consumed by a `UsersList.tsx` screen that holds its rows in **local component
state** (`useState`), exactly like `InvitationsList.tsx`. No new Redux slice.

**Rationale**:

- The user-management screen is an explicit **sibling** of the invitations screen (brainstorm Key
  Decision: "separate sibling screen mirroring the invitation admin pattern"). `InvitationsList.tsx`
  fetches via `createAsyncThunk` (`invitationsListThunks.ts`) and stores the list in `useState`, not
  in Redux — the roster should match it verbatim for "consistency over novelty".
- The `RequestContext` + Redux-slice path (languages/lessons) is for shared, long-lived domain state
  reused across many screens. The roster is admin-only, single-screen, and refetched on entry — local
  state is the right altitude (constitution VII).
- Response shapes are shared through `src/core/interfaces/Api.ts` (new `UserAccountRow`), the same
  place `InvitationSummaryRow` lives, keeping server and thunk in one contract.

**Alternatives considered**:

- `RequestContext` + a `usersSlice` — rejected: heavier than the sibling screen it must match; no
  cross-screen reuse to justify a slice.

---

## Summary of resolved unknowns

| #   | Question                         | Decision                                                                                                                                                        |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Deactivation state & enforcement | `deactivatedAt timestamptz`; reject at sign-in (`session.create.before` hook) **and** session-load (`loadSession` explicit read); revoke sessions on deactivate |
| 2   | Role-change propagation          | Flip `admin` boolean; fresh session-load (cookieCache off) makes it effective next request — no revoke                                                          |
| 3   | Endpoint strategy                | Hand-roll `/api/admin/users*`; do not enable the admin plugin                                                                                                   |
| 4   | Last-admin guard                 | Transactional `SELECT … FOR UPDATE ORDER BY id` over the active-admin set, count-in-app, refuse if `≤ 1`                                                        |
| 5   | Test isolation                   | `afterEach` resets spared rows' `deactivatedAt = NULL, admin = true`                                                                                            |
| 6   | Frontend data path               | `createAsyncThunk` + `fetch` + local `useState`, mirroring `InvitationsList`                                                                                    |

</content>
