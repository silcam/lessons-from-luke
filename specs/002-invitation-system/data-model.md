# Data Model: Invitation System

**Feature**: `002-invitation-system` | **Date**: 2026-06-17
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All storage here is **server-only authentication infrastructure** on the isolated `pg.Pool`
(constitution Principle VI server-only exemption). It MUST NOT be imported into `src/core/` or the
desktop path. The domain `postgres@1` driver and `PGStorage` are untouched.

---

## Entity: Invitation (NEW — auth-owned table `invitation`)

An administrator-issued, single-use authorization to create exactly one account.

| Field        | Type          | Constraints / Notes                                                                 | Requirement        |
| ------------ | ------------- | ----------------------------------------------------------------------------------- | ------------------ |
| `id`         | `text` (PK)   | `crypto.randomUUID()`                                                                | —                  |
| `email`      | `text`        | NOT NULL. Stored **lowercased**. Bound recipient address.                           | FR-001, FR-007     |
| `role`       | `text`        | NOT NULL. Enum: `'admin'` \| `'standard'`. Maps to `user.admin` at accept.          | FR-002, FR-008     |
| `status`     | `text`        | NOT NULL DEFAULT `'pending'`. Enum: `pending` \| `accepted` \| `expired` \| `retracted`. | FR-014        |
| `tokenHash`  | `text`        | NOT NULL **UNIQUE**. `sha256(token)` hex. Lookup key. Plaintext never stored here.  | FR-009 (single-use)|
| `tokenEnc`   | `text`        | NOT NULL. AES-256-GCM(token), encoded `iv:authTag:ciphertext` (base64). Per-row random 12-byte IV; key = KDF(`cookieSecret`). Read only by admin re-copy. | FR-016 |
| `invitedBy`  | `text`        | NOT NULL. FK → `"user"("id")`. Creating administrator (audit).                      | FR-017             |
| `createdAt`  | `timestamptz` | NOT NULL.                                                                           | FR-013             |
| `expiresAt`  | `timestamptz` | NOT NULL. `createdAt + 14 days` (system-wide default, configurable).                | FR-018             |
| `acceptedAt` | `timestamptz` | NULL until accepted; set in the accept transaction.                                 | FR-013             |

### Indexes / Invariants

| Index                              | Definition                                                            | Purpose                                            |
| ---------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| PK                                 | `("id")`                                                              | identity                                           |
| `idx_invitation_tokenHash`         | UNIQUE `("tokenHash")`                                                | O(1) single-use lookup; prevents hash collisions   |
| `idx_invitation_email`             | `(LOWER("email"))`                                                    | management list + account/dup checks               |
| `uq_invitation_one_pending_email`  | **partial** UNIQUE `(LOWER("email")) WHERE "status" = 'pending'`      | FR-005 one active invite per email (DB invariant)  |

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
- `pending → expired`: derived at read/create time when `expiresAt <= now()` (lazy UPDATE,
  research Decision 5). Link already fails at lookup regardless (FR-018).
- No transition out of any terminal state. No edit of `email`/`role` (retract + re-create instead —
  spec assumption).

### Validation rules

- `email`: valid email format at **creation** (FR: malformed email rejected); lowercased before
  store/compare.
- `role`: exactly one of `'admin'` | `'standard'`; rejected otherwise.
- Creation rejected if an account already exists for `LOWER(email)` (FR-004).
- Creation rejected if an active `pending` row already exists for `LOWER(email)` (FR-005), enforced
  by the partial unique index + caught `23505` mapped to a friendly 409.
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

### Management-list query (red-team Pass 1)

- The list query MUST `SELECT` an explicit column list that **excludes `tokenHash` and `tokenEnc`**
  so secrets never reach the response, and order `createdAt DESC` (newest first per the contract).

---

## Rate-limit storage for the anonymous invitation routes (red-team Pass 2)

The anonymous `GET /api/auth/invitation/:token` and `POST /api/auth/invitation/accept` routes are
plain Express handlers and do **not** pass through better-auth's internal rate limiter, so they need
their own DB-backed, cross-worker counter store. Two options — **the chosen one is a design input to
`/sp:05-tasks` and may add a migration**:

- **(a) New auth-owned `invitationRateLimit` table + migration** (preferred): mirrors the
  `rateLimit` shape (`key text`, `count int`, `lastRequest bigint`), on the isolated `pg.Pool`
  (Principle VI server-only). Cleanest — no coupling to better-auth's internal schema. If chosen,
  add an `AddInvitationRateLimitTable` migration (or fold it into `AddInvitationTable`) and a
  matching `DELETE FROM "invitationRateLimit"` in the `jestSetupAfterEnv.ts` `afterEach`.
- **(b) Reuse the existing `rateLimit` table** by writing rows directly on the isolated pool with a
  distinct key prefix (e.g. `invitation:<ip>`). No new migration, but couples this feature to a
  table better-auth owns.

Whichever is chosen, the limiter MUST key on `req.ip` (honoring `trust proxy = 1`), be disabled
under `NODE_ENV=test` except when the integration server opts in via an env flag, and emit the
contract's `429`.

---

## Entity: User / Account (EXISTING — `user`, `account` tables; unchanged schema)

Created by the accept flow via direct SQL (research Decision 1), mirroring `SeedAdminUser`.

| Aspect              | Value at accept                                                                 | Requirement |
| ------------------- | ------------------------------------------------------------------------------- | ----------- |
| `user.id`           | `crypto.randomUUID()`                                                            | —           |
| `user.email`        | invitation `email` (lowercased, bound — NOT from request body)                  | FR-007      |
| `user.name`         | recipient-supplied display name (NOT NULL column)                               | FR-008      |
| `user.admin`        | `invitation.role === 'admin'` → `true`, else `false` (set via direct SQL only)  | FR-008      |
| `user.emailVerified`| `false` (consistent with seed)                                                  | —           |
| `account.providerId`| `'credential'`                                                                  | —           |
| `account.password`  | `passwordHasher.hash(password)` — Argon2id, same format as seed/integration test| FR-008, FR-011 |

No new columns on `user`/`account`. No session created at accept (FR-012).

---

## Configuration / Secrets

| Key                          | Where                         | Notes                                                              |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `BETTER_AUTH_URL`            | env (existing)                | base origin for invitation links; https-required in prod (existing)|
| `cookieSecret` (≥ 32 chars)  | `secrets.json` (existing)     | reused to derive the AES-256-GCM key for `tokenEnc`                 |
| Invitation TTL (14 days)     | server constant (new)         | single system-wide default; not per-invite (spec assumption)       |

No new `secrets.json` field is required (reuses `cookieSecret`, `BETTER_AUTH_URL`).

---

## Test-isolation note

`invitation` rows are written on the isolated `pg.Pool`, outside `TransactionalTestStorage`. The
`afterEach` in `src/server/jestSetupAfterEnv.ts` MUST `DELETE FROM "invitation"` **before** the
`user` delete (the `invitedBy` FK is NOT NULL; a leftover invitation referencing a deleted
non-admin user raises `23503` and breaks isolation), alongside the existing `rateLimit`/`session`/
`verification`/`account`/`user` cleanup (research Decision 3).

The `invitedBy` FK is a plain `REFERENCES "user"("id")` with **no `ON DELETE CASCADE`** (red-team
Pass 1): audit history (FR-019) must never be silently destroyed by a future user deletion, and
account/admin deletion is Out of Scope. This makes "delete an admin who has issued invitations" a
documented latent constraint, not a supported operation.
