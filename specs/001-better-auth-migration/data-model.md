# Phase 1 Data Model: Better-Auth Migration

**Feature**: `001-better-auth-migration`
**Date**: 2026-06-05
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

This feature introduces **server-only authentication infrastructure** that owns its own four
tables through an isolated `pg.Pool` (constitution Principle VI v1.1.0 exemption). These tables are
NOT domain data and do NOT go through the `Persistence` interface. Column names are dictated by
better-auth and MUST NOT be renamed.

Two model surfaces are described:

1. **Storage entities** (PostgreSQL tables owned by better-auth) — created by DDL migration.
2. **Shared application type** (`src/core/models/User.ts`) — the isomorphic shape the
   frontend/server reason about.

---

## 1. Storage entities (better-auth tables)

### Entity: `user`

The authenticatable identity. (Spec Key Entity: **Account (User)**.)

| Field           | Type          | Constraints                                  | Notes                                   |
| --------------- | ------------- | -------------------------------------------- | --------------------------------------- |
| `id`            | `text`        | PRIMARY KEY                                  | better-auth-generated opaque string     |
| `name`          | `text`        | NOT NULL; `char_length <= 255`               | display name                            |
| `email`         | `text`        | NOT NULL, **UNIQUE**; `char_length <= 254`   | login identifier (FR-013 uniqueness)    |
| `emailVerified` | `boolean`     | NOT NULL DEFAULT false                       | unused in this cut (no verify flow)     |
| `image`         | `text`        | nullable                                     | unused                                  |
| `admin`         | `boolean`     | NOT NULL DEFAULT false                       | **additionalField**; the capability gate |
| `createdAt`     | `timestamptz` | NOT NULL                                     |                                         |
| `updatedAt`     | `timestamptz` | NOT NULL                                     |                                         |

- **Validation rules**: `email` uniqueness enforced at the DB (FR-013); `admin` defaults false
  (input disabled via better-auth `additionalFields: { admin: { input: false } }` so it cannot be
  set through any public API — only the seed/raw SQL sets `admin: true`).
- **Maps to**: FR-001, FR-004, FR-013; US1, US2, US4.

### Entity: `account`

The stored credential for an account's email/password method. (Spec Key Entity: **Credential**.)

| Field                   | Type          | Constraints                                  | Notes                                     |
| ----------------------- | ------------- | -------------------------------------------- | ----------------------------------------- |
| `id`                    | `text`        | PRIMARY KEY                                  |                                           |
| `userId`                | `text`        | NOT NULL, FK → `user(id)` ON DELETE CASCADE  |                                           |
| `accountId`             | `text`        | NOT NULL                                     | equals `user.id` for credential provider  |
| `providerId`            | `text`        | NOT NULL                                     | `'credential'` for email/password         |
| `accessToken`           | `text`        | nullable                                     | unused (no OAuth)                         |
| `refreshToken`          | `text`        | nullable                                     | unused                                    |
| `idToken`               | `text`        | nullable                                     | unused                                    |
| `accessTokenExpiresAt`  | `timestamptz` | nullable                                     | unused                                    |
| `refreshTokenExpiresAt` | `timestamptz` | nullable                                     | unused                                    |
| `scope`                 | `text`        | nullable                                     | unused                                    |
| `password`              | `text`        | nullable                                     | **Argon2id hash** (`argon2id$m$t$p$salt$hash`) |
| `createdAt`             | `timestamptz` | NOT NULL                                     |                                           |
| `updatedAt`             | `timestamptz` | NOT NULL                                     |                                           |
| _index_                 |               | `idx_account_userId` on `(userId)`           |                                           |

- **Validation rules**: `password` is ALWAYS a one-way Argon2id hash, never plaintext (FR-001,
  SC-003). The seed and the runtime hasher produce byte-identical formats so verification succeeds.
- **Maps to**: FR-001; US1.

### Entity: `session`

A server-side session bound to an account. (Spec Key Entity: **Session**.)

| Field        | Type          | Constraints                                  | Notes                                |
| ------------ | ------------- | -------------------------------------------- | ------------------------------------ |
| `id`         | `text`        | PRIMARY KEY                                  |                                      |
| `userId`     | `text`        | NOT NULL, FK → `user(id)` ON DELETE CASCADE  |                                      |
| `token`      | `text`        | NOT NULL, UNIQUE; `char_length <= 64`        | session token (cookie value source)  |
| `expiresAt`  | `timestamptz` | NOT NULL                                     | bounded lifetime (FR-006)            |
| `ipAddress`  | `text`        | nullable                                     | from `X-Forwarded-For`               |
| `userAgent`  | `text`        | nullable                                     |                                      |
| `createdAt`  | `timestamptz` | NOT NULL                                     |                                      |
| `updatedAt`  | `timestamptz` | NOT NULL                                     | refreshed on `updateAge`             |
| _index_      |               | `idx_session_userId` on `(userId)`           |                                      |

- **Lifecycle / state**: created on sign-in; `expiresAt = createdAt + expiresIn (30d)`; refreshed
  when older than `updateAge (1d)`; deleted on sign-out. An expired session is treated as
  unauthenticated (FR-006). **Test isolation**: `session` rows are written on the auth `pg.Pool`,
  outside the domain test transaction, so they are deleted in `afterEach` (research Decision 5).
- **Maps to**: FR-005, FR-006, FR-010; US1, US3.

### Entity: `verification`

Short-lived token storage used internally by better-auth. (Spec Key Entity: **Verification token**.)

| Field        | Type          | Constraints                                  | Notes                          |
| ------------ | ------------- | -------------------------------------------- | ------------------------------ |
| `id`         | `text`        | PRIMARY KEY                                  |                                |
| `identifier` | `text`        | NOT NULL; `char_length <= 255`               |                                |
| `value`      | `text`        | NOT NULL                                     |                                |
| `expiresAt`  | `timestamptz` | NOT NULL                                     |                                |
| `createdAt`  | `timestamptz` | nullable                                     |                                |
| `updatedAt`  | `timestamptz` | nullable                                     |                                |
| _index_      |               | `idx_verification_identifier` on `(identifier)` |                             |

- **Notes**: minimal in this cut (no email verification or reset flows enabled). Table exists
  because better-auth's schema expects it. Cleaned in `afterEach` alongside `session` for isolation.

### Relationships

```
user (1) ──< (N) account     account.userId → user.id   ON DELETE CASCADE
user (1) ──< (N) session     session.userId → user.id   ON DELETE CASCADE
verification                 (no FK; identifier-keyed)
```

### Migration DDL ordering

- **`up`** (create): `user` → `session` → `account` → `verification` (FK targets first), then the
  three indexes. Wrap in `sql.begin` for atomicity.
- **`down`** (drop): reverse — `verification` → `account` → `session` → `user`.
- **Seed migration** (separate file, runs after DDL): inserts one `user` (`admin:true`) + one
  `account` from `secrets.adminEmail`/`adminPassword`; idempotent (skip if email exists); throws if
  `adminEmail` missing. (FR-003, US4.)

---

## 2. Shared application type — `src/core/models/User.ts`

The isomorphic shape consumed by the frontend and server middleware. This is the **only** auth type
that crosses into `core` (it carries no DB/connection concerns, so it is exempt-compliant).

```ts
/** An authenticated administrator identity surfaced to the app. */
export interface User {
  /** Opaque better-auth account identifier. Was `number`; now a string. */
  id: string;
  /** Whether this account may access admin-only functionality. */
  admin: boolean;
}

/** Credentials submitted at the web sign-in form. */
export interface LoginAttempt {
  /** Account email (was `username`). */
  email: string;
  password: string;
}
```

- **Change from current**: `User.id: number → string` (FR / research Decision 9);
  `LoginAttempt.username → email` (FR-007; US1).
- **State**: in the Redux `currentUser` slice, `user` is `User | null` plus a `loaded` flag.
  `null` ⇔ "not signed in" / "session expired" (FR-006).

### State transitions (session lifecycle, app view)

```
[anonymous: user=null]
   │  sign-in (email+password OK)              authClient.signIn.email → setUser(user)
   ▼
[authenticated: user={id, admin}]
   │  get-session on load / refresh            authClient.getSession → setUser(user|null)
   │  sign-out                                 authClient.signOut → logout() → user=null
   │  session expired (server returns null)    setUser(null)
   ▼
[anonymous: user=null]
```

- **Admin gating** (orthogonal to the above, enforced server-side per request): for `/api/admin/*`,
  `requireAdmin` resolves the session → 401 if `user=null`, 403 if `user.admin !== true`, else next.
  (FR-004; US2.)
