# Data Model: Invitation System

**Feature**: `002-invitation-system` | **Date**: 2026-06-17
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All storage here is **server-only authentication infrastructure** on the isolated `pg.Pool`
(constitution Principle VI server-only exemption). It MUST NOT be imported into `src/core/` or the
desktop path. The domain `postgres@1` driver and `PGStorage` are untouched.

---

## Entity: Invitation (NEW — auth-owned table `invitation`)

An administrator-issued, single-use authorization to create exactly one account.

| Field        | Type          | Constraints / Notes                                                                                                                                       | Requirement         |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `id`         | `text` (PK)   | `crypto.randomUUID()`                                                                                                                                     | —                   |
| `email`      | `text`        | NOT NULL. Stored **lowercased**. Bound recipient address.                                                                                                 | FR-001, FR-007      |
| `role`       | `text`        | NOT NULL. Enum: `'admin'` \| `'standard'`. Maps to `user.admin` at accept.                                                                                | FR-002, FR-008      |
| `status`     | `text`        | NOT NULL DEFAULT `'pending'`. Enum: `pending` \| `accepted` \| `expired` \| `retracted`.                                                                  | FR-014              |
| `tokenHash`  | `text`        | NOT NULL **UNIQUE**. `sha256(token)` hex. Lookup key. Plaintext never stored here.                                                                        | FR-009 (single-use) |
| `tokenEnc`   | `text`        | NOT NULL. AES-256-GCM(token), encoded `iv:authTag:ciphertext` (base64). Per-row random 12-byte IV; key = KDF(`cookieSecret`). Read only by admin re-copy. | FR-016              |
| `invitedBy`  | `text`        | NOT NULL. FK → `"user"("id")`. Creating administrator (audit).                                                                                            | FR-017              |
| `createdAt`  | `timestamptz` | NOT NULL.                                                                                                                                                 | FR-013              |
| `expiresAt`  | `timestamptz` | NOT NULL. `createdAt + 14 days` (system-wide default, configurable).                                                                                      | FR-018              |
| `acceptedAt` | `timestamptz` | NULL until accepted; set in the accept transaction.                                                                                                       | FR-013              |

### Indexes / Invariants

| Index                             | Definition                                                       | Purpose                                           |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| PK                                | `("id")`                                                         | identity                                          |
| `idx_invitation_tokenHash`        | UNIQUE `("tokenHash")`                                           | O(1) single-use lookup; prevents hash collisions  |
| `idx_invitation_email`            | `(LOWER("email"))`                                               | management list + account/dup checks              |
| `uq_invitation_one_pending_email` | **partial** UNIQUE `(LOWER("email")) WHERE "status" = 'pending'` | FR-005 one active invite per email (DB invariant) |

### State machine

```
            create (admin)
   [*] ───────────────────────▶ pending
                                  │
   recipient redeems ◀───────────┤──────────▶ expired   (lazy: pending AND expiresAt <= now())
   (sets pw+name)                │
        │                        └──────────▶ retracted (admin action, FR-015)
        ▼
     accepted  (acceptedAt set; account created in same txn)

accepted | expired | retracted are TERMINAL and RETAINED (FR-019). No link works in terminal states.
```

Transition rules:

- `pending → accepted`: only via valid token at `POST /api/auth/invitation/accept`, inside one
  transaction that also inserts `user`+`account`. Single-use (FR-009).
- `pending → retracted`: admin only, only while `pending` (FR-015). Link dies immediately (SC-004).
  **MUST be a conditional, atomic UPDATE (red-team Pass 11):** `UPDATE "invitation" SET
status='retracted' WHERE id=$1 AND status='pending' RETURNING ...` — **not** a SELECT-then-UPDATE.
  A non-atomic retract races a concurrent `accept` on the same pending row (both read `pending`, the
  accept commits the account + flips to `accepted`, then an unconditional retract overwrites the
  already-accepted row to `retracted`), corrupting a terminal state and violating SC-005. With the
  conditional UPDATE, an accept that commits first leaves the row `accepted` and the racing retract
  matches **0 rows** (→ `409` "not Pending", distinguished from `404` by a cheap existence check on
  the 0-row path) — the same single-source-of-truth pattern the accept flip uses.
- `pending → expired`: derived at read/create time when `expiresAt <= now()` (lazy UPDATE,
  research Decision 5). Link already fails at lookup regardless (FR-018).
- No transition out of any terminal state. No edit of `email`/`role` (retract + re-create instead —
  spec assumption).

### Validation rules

- `email`: valid email format at **creation** (FR: malformed email rejected); lowercased before
  store/compare; **capped at 254 chars** (RFC 5321 max addressable length, red-team Pass 6) and
  rejected (`400`) before any DB write so an unbounded value cannot bloat the row or the
  `idx_invitation_email` / `uq_invitation_one_pending_email` / `user.email` indexes.
- `role`: exactly one of `'admin'` | `'standard'`; rejected otherwise.
- Creation rejected if an account already exists for `LOWER(email)` (FR-004). This is a pre-insert
  `SELECT` on the **`user`** table, so it never raises a `23505` on the `invitation` insert.
- Creation rejected if an active `pending` row already exists for `LOWER(email)` (FR-005), enforced
  by the partial unique index + a caught `23505` mapped to a friendly 409. **The create handler MUST
  branch on `error.constraint`, not blanket-map every `23505` (red-team Pass 11):** the `invitation`
  table has **two** unique constraints an INSERT can violate — `uq_invitation_one_pending_email`
  (→ the FR-005 409 "active pending invite") and `idx_invitation_tokenHash` (a token-hash collision →
  **regenerate the token and retry the insert once**, never surface as the FR-005 409). Any other
  `23505` → a generic `500`, not the FR-005 message. A blanket map would mis-report a tokenHash
  collision as a pending-email conflict and silently swallow any future unique constraint.
- `token` (transient, not a column): 256-bit `randomBytes(32).base64url`.

### `tokenEnc` encryption rules (red-team Pass 1)

- AES-256-GCM with a **fresh random 12-byte IV per row** (never a static/zero IV — GCM IV reuse is
  catastrophic). Persist `iv`, `authTag`, and ciphertext together in the single `tokenEnc` column,
  e.g. `base64(iv):base64(authTag):base64(ciphertext)`.
- Key = 32 bytes derived from `cookieSecret` via a KDF (`scrypt`/HKDF with a fixed feature-scoped
  salt), not the raw secret bytes.
- On re-copy, verify the GCM auth tag; a decrypt/auth failure (e.g. after a `cookieSecret` rotation)
  maps to a `409`/"link unavailable", not a 500. Link redemption still works via `tokenHash`, so a
  failed `tokenEnc` decrypt degrades gracefully (re-copy unavailable, link still valid).

### Accept transaction & lazy-expire concurrency (red-team Pass 1)

- The accept status flip MUST be **conditional and atomic**:
  `UPDATE "invitation" SET status='accepted', "acceptedAt"=now() WHERE id=$1 AND status='pending'
AND "expiresAt" > now()` inside the same transaction that inserts `user`+`account`; a 0-row result
  means "invalid link" → `410` and the transaction rolls back (no account created). This conditional
  update — not the lazy-expire UPDATE — is the single source of truth for single-use + expiry under
  concurrency.
- The lazy `pending → expired` UPDATE run on the **create** and **list** paths is only a
  display/uniqueness convenience (keeps the partial-unique-pending index from falsely blocking a
  re-invite and keeps the list honest); it is never authoritative for redemption validity.

### Management-list query (red-team Pass 1, Pass 10)

- The list query MUST `SELECT` an explicit column list that **excludes `tokenHash` and `tokenEnc`**
  so secrets never reach the response, and order `createdAt DESC` (newest first per the contract).
- **`invitedByEmail` is a JOIN, not a column (red-team Pass 10).** The contract's `InvitationSummary`
  returns `invitedByEmail`, but this table stores only `invitedBy` = the creating admin's `user.id`.
  The list query MUST `JOIN "user" ON "user"."id" = "invitation"."invitedBy"` and project
  `"user"."email" AS "invitedByEmail"`. An **inner** join is correct: `invitedBy` is `NOT NULL`, the
  FK is plain (never `ON DELETE CASCADE`), and the inviting admin is never hard-deleted while rows
  reference them (see the `invitedBy` FK-lifecycle note below), so the joined `user` row always
  exists. Select only `"user"."email"` from the joined side — no other `user` columns reach the
  response.
- **Cache-Control (red-team Pass 10, Pass 11).** The list `200` body carries every invited person's
  `email` plus every admin's `invitedByEmail` — the largest PII surface on the feature. The handler
  MUST set `Cache-Control: no-store` (with defensive `Pragma: no-cache`), matching the single-email
  lookup (Pass 7) and link-bearing responses (Pass 7/8). **The `retract` `200` returns the same
  single `InvitationSummary` shape (`email` + `invitedByEmail`) and MUST be hardened identically
  (red-team Pass 11)** — Pass 10's "complete and symmetric" set omitted it. With both, the `no-store`
  set covers **every** email-/link-bearing invitation response (create `201`, list `200`, retract
  `200`, re-copy `link` `200`, anonymous lookup `200`, accept `200`).
- **Retract shares the list's `invitedBy` JOIN (red-team Pass 11).** Because the `retract` `200`
  returns the same `InvitationSummary` (with the required `invitedByEmail`), the retract handler MUST
  resolve `invitedByEmail` via the identical `JOIN "user" ON "user"."id" = "invitation"."invitedBy"`
  (project `"user"."email" AS "invitedByEmail"`) used by the list — reuse one row-mapping helper so
  the two cannot diverge. Same inner-join safety holds (`invitedBy` NOT NULL, never hard-deleted).

---

## Rate-limit storage for the anonymous invitation routes (red-team Pass 2)

**Decision**: Option (a) — a new **auth-owned `invitationRateLimit` table** on the isolated
`pg.Pool` (Principle VI server-only). This avoids any coupling to better-auth's internal
`rateLimit` schema and keeps the feature fully self-contained.

### Entity: `invitationRateLimit` (NEW — auth-owned)

Mirrors the shape of better-auth's own `rateLimit` table (`key`, `count`, `lastRequest`) but is
owned by this feature and lives in the same isolated `pg.Pool`.

| Field         | Type      | Constraints / Notes                                                 |
| ------------- | --------- | ------------------------------------------------------------------- |
| `key`         | `text`    | PRIMARY KEY. Format: `invitation:<ip>` (e.g. `invitation:1.2.3.4`). |
| `count`       | `integer` | NOT NULL. Request count within the current window.                  |
| `lastRequest` | `bigint`  | NOT NULL. Unix ms timestamp of the most recent request.             |

Window: ≤ 10 requests per 60 seconds per IP. Keyed on `req.ip` (which honors
`app.set("trust proxy", 1)` and the `X-Forwarded-For` hop from Passenger).

### Concurrency-safe increment + pruning (red-team Pass 3)

- **Atomic increment (no TOCTOU).** A "SELECT count → compare → UPDATE" sequence races: two
  concurrent requests can both read `count = max-1` and both pass. The limiter MUST increment and
  read back in a **single atomic statement** and decide on the **returned** post-increment count:

  ```sql
  INSERT INTO "invitationRateLimit" ("key", "count", "lastRequest")
  VALUES ($key, 1, $now)
  ON CONFLICT ("key") DO UPDATE SET
    "count"       = CASE WHEN "invitationRateLimit"."lastRequest" < $windowStart
                         THEN 1
                         ELSE "invitationRateLimit"."count" + 1 END,
    "lastRequest" = $now
  RETURNING "count";
  ```

  `$windowStart = $now - 60_000` (ms). If `RETURNING "count" > 10`, respond `429`. This makes the
  per-IP limit a true invariant under concurrent requests across Passenger workers (the row is the
  shared state), mirroring how the partial-unique-pending index makes the one-pending-invite rule a
  DB invariant rather than a check-then-act race.

- **Pruning (bounded growth).** Unlike `invitation` rows, `invitationRateLimit` rows have **no audit
  value**, so FR-019's retain-forever does NOT apply. Without pruning the table grows one row per
  distinct client IP forever (a slow resource leak). Prune opportunistically with no cron: on each
  limiter write also run (or fold into the same path) `DELETE FROM "invitationRateLimit" WHERE
"lastRequest" < $windowStart` — cheap, bounded, and keeps the table to roughly the set of IPs
  active within the last window.

**Migration**: `migrations/<timestamp>-AddInvitationRateLimitTable.js` — a separate migration
file (not folded into `AddInvitationTable`) so each migration is a single-concern, independently
rollable unit. Follows the existing `makeDbConnect()` pattern with `up`/`down`.

**DDL** (up migration):

```sql
CREATE TABLE "invitationRateLimit" (
  "key"         text    PRIMARY KEY,
  "count"       integer NOT NULL,
  "lastRequest" bigint  NOT NULL
);
```

**Test isolation**: `DELETE FROM "invitationRateLimit"` added to the `afterEach` in
`jestSetupAfterEnv.ts`. Because `invitationRateLimit` has no foreign keys, it may be deleted at
any point in the cleanup order (e.g. alongside `rateLimit`, before `invitation`).

**Disabled in test** (consistent with better-auth's own `rateLimit`): the rate-limit middleware
skips enforcement when `NODE_ENV=test`, except when the integration server opts in.

**The opt-in flag MUST be one the integration server actually sets (red-team Pass 12).** Grounded
against `scripts/integrationTestServer.js`: the integration server already sets
`BETTER_AUTH_ENFORCE_ORIGIN=1` **and** `BETTER_AUTH_ENFORCE_RATE_LIMIT=1` before constructing the
app (so the existing better-auth `/sign-in/email` 429 test runs), but it sets **no**
`INVITATION_RATE_LIMIT_ENFORCE` variable. A custom invitation rate limiter gated on a _new_
`INVITATION_RATE_LIMIT_ENFORCE=1` flag would therefore **never be enforced under the integration
suite**, so the invitation `429` path the contract declares (`GET /api/auth/invitation/:token` and
`POST .../accept`) would be **untestable end-to-end** — a silent coverage hole behind a green CI.
Resolve one of two ways, both of which keep the 429 path exercised:

- **(preferred) Reuse `BETTER_AUTH_ENFORCE_RATE_LIMIT`** — the invitation limiter enforces when
  `NODE_ENV !== 'test' || process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT === '1'`, the **same predicate
  `auth.ts` already uses** for better-auth's limiter. The integration server already sets this flag,
  so the invitation 429 path is exercised with no new wiring, and the invitation limiter and the
  better-auth limiter are on/off together (one mental model, no drift).
- **(alternative) Add a dedicated `INVITATION_RATE_LIMIT_ENFORCE=1`** and **also edit
  `scripts/integrationTestServer.js` to set it** (a listed source edit, not a doc-only note),
  alongside the two existing `BETTER_AUTH_ENFORCE_*` lines. If this path is taken, the
  `scripts/integrationTestServer.js` edit is a required task, not optional.

Either way, the invitation limiter MUST NOT invent a test opt-in flag that nothing sets.

Rationale for option (a) over (b): no coupling to better-auth's internal `rateLimit` schema
(which better-auth owns and may migrate), consistent with Principle VI server-only isolation, and
gives a clear ownership boundary for cleanup and migration management.

---

## Entity: User / Account (EXISTING — `user`, `account` tables; unchanged schema)

Created by the accept flow via direct SQL (research Decision 1), mirroring `SeedAdminUser`.

| Aspect               | Value at accept                                                                                                                                                                                                                                                                                          | Requirement    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `user.id`            | `crypto.randomUUID()`                                                                                                                                                                                                                                                                                    | —              |
| `user.email`         | invitation `email` (lowercased, bound — NOT from request body)                                                                                                                                                                                                                                           | FR-007         |
| `user.name`          | recipient-supplied display name (NOT NULL column); the **only** attacker-controlled field persisted from the anonymous accept route — `trim()`, reject empty-after-trim, reject ASCII control chars/newlines, all **before** the Argon2id hash (red-team Pass 6). Rendered only via React auto-escaping. | FR-008         |
| `user.admin`         | `invitation.role === 'admin'` → `true`, else `false` (set via direct SQL only)                                                                                                                                                                                                                           | FR-008         |
| `user.emailVerified` | `false` (consistent with seed)                                                                                                                                                                                                                                                                           | —              |
| `account.providerId` | `'credential'`                                                                                                                                                                                                                                                                                           | —              |
| `account.password`   | `passwordHasher.hash(password)` — Argon2id, same format as seed/integration test                                                                                                                                                                                                                         | FR-008, FR-011 |

No new columns on `user`/`account`. No session created at accept (FR-012).

---

## Configuration / Secrets

| Key                         | Where                     | Notes                                                               |
| --------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `BETTER_AUTH_URL`           | env (existing)            | base origin for invitation links; https-required in prod (existing) |
| `cookieSecret` (≥ 32 chars) | `secrets.json` (existing) | reused to derive the AES-256-GCM key for `tokenEnc`                 |
| Invitation TTL (14 days)    | server constant (new)     | single system-wide default; not per-invite (spec assumption)        |

No new `secrets.json` field is required (reuses `cookieSecret`, `BETTER_AUTH_URL`).

---

## Test-isolation note

`invitation` rows are written on the isolated `pg.Pool`, outside `TransactionalTestStorage`. The
`afterEach` in `src/server/jestSetupAfterEnv.ts` MUST `DELETE FROM "invitation"` **before** the
`user` delete (the `invitedBy` FK is NOT NULL; a leftover invitation referencing a deleted
non-admin user raises `23503` and breaks isolation), alongside the existing `rateLimit`/`session`/
`verification`/`account`/`user` cleanup (research Decision 3).

**Grounded against the actual cleanup (red-team Pass 12).** The existing `afterEach` does **not** run
a blanket `DELETE FROM "user"`; it deletes `account` then `user` **scoped to non-admin rows**
(`WHERE LOWER(email) != $adminEmail`), sparing the seeded admin so `loggedInAgent()` survives across
tests. Two precise consequences for the invitation delete:

1. **`23503` only arises for invitations whose `invitedBy` points at a _deleted_ (non-admin) user.**
   An invitation created by a _non-admin_ admin (an admin onboarded via a prior invite) references a
   row the scoped delete removes, so `DELETE FROM "invitation"` MUST precede the scoped `user` delete
   to avoid the FK violation — the ordering rule stands. An invitation created by the _seeded_ admin
   references a row that is **spared**, so it would not raise `23503`; but it would still **leak**
   across tests (the admin is never deleted, so the invitation persists and can trip the
   partial-unique-pending index or pollute a later list assertion). Hence the unconditional
   `DELETE FROM "invitation"` is required for isolation regardless of who created the row — not only
   to dodge `23503`.
2. **Place the invitation delete before the `account`/`user` deletes** (it is unconditional —
   `DELETE FROM "invitation"`, no `WHERE`), so the row count is zero before either user-row delete
   runs and neither the scoped nor a future unscoped user delete can hit the FK. `invitationRateLimit`
   has no FK and may be deleted in any position.

The `invitedBy` FK is a plain `REFERENCES "user"("id")` with **no `ON DELETE CASCADE`** (red-team
Pass 1): audit history (FR-019) must never be silently destroyed by a future user deletion, and
account/admin deletion is Out of Scope. This makes "delete an admin who has issued invitations" a
documented latent constraint, not a supported operation.
