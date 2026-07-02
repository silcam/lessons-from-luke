# Data Model: User Account Management

**Feature**: `006-user-account-management` | **Date**: 2026-07-02
**Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

All storage here is **server-only authentication infrastructure** on the isolated `getAuthPool()`
`pg.Pool` (constitution Principle VI server-only exemption). It MUST NOT be imported into `src/core/`
or the desktop path. The domain `postgres@1.0.2` driver and `PGStorage` are untouched. This feature
adds **one nullable column** to an existing auth table and creates **no new tables**.

---

## Entity: User Account (EXISTING auth-owned table `"user"` — one column ADDED)

A person's web login. The table was created by `001` (`migrations/1780760814404-AddBetterAuthTables.js`)
and seeded by `1780760814405-SeedAdminUser.js`. This feature adds `deactivatedAt`.

| Field           | Type          | Constraints / Notes                                                                                    | Requirement    |
| --------------- | ------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| `id`            | `text` (PK)   | Existing. `crypto.randomUUID()`.                                                                       | —              |
| `name`          | `text`        | Existing. Display name.                                                                                | FR-001         |
| `email`         | `text`        | Existing. NOT NULL UNIQUE. Unique identity. Stored lowercased.                                         | FR-001         |
| `emailVerified` | `boolean`     | Existing.                                                                                              | —              |
| `image`         | `text`        | Existing. Unused by this feature.                                                                      | —              |
| `admin`         | `boolean`     | Existing. NOT NULL DEFAULT false. **Role** mechanism: `true` ⇒ Admin, `false` ⇒ Standard.              | FR-003         |
| `deactivatedAt` | `timestamptz` | **NEW. NULL** ⇒ Active; **non-NULL** ⇒ Deactivated (offboarding timestamp). Reversible → back to NULL. | FR-005..FR-008 |
| `createdAt`     | `timestamptz` | Existing. NOT NULL. Shown in the roster.                                                               | FR-001         |
| `updatedAt`     | `timestamptz` | Existing. NOT NULL. Bumped on every mutation.                                                          | —              |

### Derived fields (computed in queries / controller — never stored)

| Derived    | Rule                                                            | Requirement |
| ---------- | --------------------------------------------------------------- | ----------- |
| **Role**   | `admin = true → 'admin'`, else `'standard'`                     | FR-003      |
| **Status** | `deactivatedAt IS NULL → 'active'`, else `'deactivated'`        | FR-005/007  |
| **isSelf** | `"user".id = req.user.id` (computed in the controller, not SQL) | FR-002      |

### Migration

`migrations/<Date.now()>-AddUserDeactivatedAt.js` (timestamp strictly greater than the current last
migration `1781767466147`):

- **up**: `ALTER TABLE "user" ADD COLUMN "deactivatedAt" timestamptz` (nullable, no default → all
  existing rows are Active). No index — the roster scans ≤ tens of rows and enforcement lookups are
  by PK `id`.
- **down**: `ALTER TABLE "user" DROP COLUMN "deactivatedAt"`.

The seeded admin (`SeedAdminUser`) is unaffected: a `NULL` `deactivatedAt` leaves it Active.

---

## Relationships (unchanged, preserved)

- **`invitation.invitedBy` → `"user"("id")`** (created by `002`, `RESTRICT`/no cascade). Preserved by
  the reversible-deactivate choice: deactivation never deletes a `"user"` row, so the `invitedBy`
  audit chain is never violated (FR-007, spec Assumptions / Out of Scope: "No hard delete").
- **`session.userId` → `"user"("id")` ON DELETE CASCADE** (created by `001`). Session revocation is a
  direct `DELETE FROM "session" WHERE "userId" = $1` on the auth pool (deactivate + force-sign-out).
- **`account.userId` → `"user"("id")` ON DELETE CASCADE** (credential row). Untouched by this feature
  — deactivation preserves the credential so reactivation restores sign-in without re-invite (FR-006).

---

## State model: Account status

```
        deactivate (admin; guarded)
 active ───────────────────────────▶ deactivated
   ▲            + DELETE sessions          │
   │                                       │
   └───────────────────────────────────────┘
           reactivate (admin)

Guards on `active → deactivated`:
  • self-lockout: target.id == actingAdmin.id           → SelfDeactivationError (refused)
  • last-admin:  target is the only active admin         → LastAdminError (refused)
Idempotency:
  • deactivate an already-deactivated account → no-op, returns current (Deactivated) row
  • reactivate an already-active account      → no-op, returns current (Active) row
```

Role is an **orthogonal** axis to status (brainstorm Key Decision: "deactivation is a separate new
state from role"):

```
        promote (admin)
 standard ───────────────▶ admin
   ▲                         │
   └─────────────────────────┘
        demote (admin; last-admin guarded)

Guard on `admin → standard`:
  • last-admin: target is the only active admin → LastAdminError (refused)
  (No self-guard: an admin MAY demote themselves while another active admin remains — spec Edge Cases.)
```

---

## Store operations (`src/server/auth/userStore.ts` — pure DB access on the auth pool)

Mirrors `invitationStore.ts`: pure `pg.Pool` access, throwing the typed errors from
`userValidation.ts` (mirrors `invitationValidation.ts`). All row-returning queries derive `role` and
`status` and never expose `password`/session tokens.

| Function                                          | Behavior                                                                                                                                                                                                                                                                                                                                                                                                     | Requirement                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `listAccounts(pool)`                              | `SELECT id, email, name, admin, "deactivatedAt", "createdAt" FROM "user" ORDER BY "createdAt" ASC`. Maps to `AccountSummary[]` with derived `role`/`status`. `isSelf` added by the controller.                                                                                                                                                                                                               | FR-001, FR-007                 |
| `changeRole(pool, targetId, newRole)`             | Transaction. Lock active-admin set (`FOR UPDATE ORDER BY id`). Fetch target (else `UserNotFoundError`). If demoting an active admin and `activeAdminCount ≤ 1` → `LastAdminError`. `UPDATE admin = (newRole==='admin'), updatedAt=now()`. COMMIT. Returns updated `AccountSummary`. No session change (propagates via fresh session-load).                                                                   | FR-003, FR-004, FR-012, FR-013 |
| `deactivateAccount(pool, actingUserId, targetId)` | If `targetId === actingUserId` → `SelfDeactivationError`. Transaction. Lock active-admin set. Fetch target (else `UserNotFoundError`). If already deactivated → no-op return. If active admin and `activeAdminCount ≤ 1` → `LastAdminError`. `UPDATE deactivatedAt = now()` (conditional on `deactivatedAt IS NULL`). `DELETE FROM "session" WHERE "userId" = $1`. COMMIT. Returns updated `AccountSummary`. | FR-005, FR-007, FR-008, FR-012 |
| `reactivateAccount(pool, targetId)`               | Fetch target (else `UserNotFoundError`). `UPDATE deactivatedAt = NULL` (no-op if already active). Returns updated `AccountSummary`. No session change.                                                                                                                                                                                                                                                       | FR-006                         |
| `revokeSessions(pool, targetId)`                  | Fetch target (else `UserNotFoundError`). `DELETE FROM "session" WHERE "userId" = $1` (0 rows = success, nothing to revoke). Leaves `deactivatedAt` untouched (account stays Active). Returns updated `AccountSummary` (+ revoked count).                                                                                                                                                                     | FR-009                         |

### Last-admin lock (shared fragment — Decision 4)

Every guarded mutation acquires the same lock in the same order to serialize correctly and preclude
deadlock:

```sql
SELECT id FROM "user"
 WHERE admin = true AND "deactivatedAt" IS NULL
 ORDER BY id
 FOR UPDATE;
```

Count the returned rows in app code. Under READ COMMITTED, a second concurrent guarded mutation blocks
on these locks; when the first commits, EvalPlanQual re-checks the second's `WHERE`, the
just-mutated row drops out of the active-admin set, the count becomes `1`, and the second is refused —
so the system never reaches zero admins (spec Edge Case; FR-012).

---

## Enforcement points (Decision 1)

| Point                                           | Change                                                                                                                                                                       | Requirement |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `auth.ts` `databaseHooks.session.create.before` | `SELECT "deactivatedAt" FROM "user" WHERE id = session.userId`; if non-NULL, throw `APIError("UNAUTHORIZED", …)` → no session minted → sign-in fails.                        | FR-005      |
| `requireUser.ts` `loadSession()`                | After `getSession()` returns a session, `SELECT "deactivatedAt" FROM "user" WHERE id = $1`; if non-NULL, return `null` and leave `req.user` unset (treated unauthenticated). | FR-005      |

---

## API response shape (shared contract — `src/core/interfaces/Api.ts`)

New interface alongside the existing `InvitationSummaryRow`:

```ts
/** Row returned by the /api/admin/users roster and mutation endpoints. */
export interface UserAccountRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "standard"; // derived from user.admin
  status: "active" | "deactivated"; // derived from user.deactivatedAt
  createdAt: string; // ISO
  isSelf: boolean; // row.id === requesting admin's id
}
```

`APIGet`/`APIPost` route entries are added for the endpoints in
[contracts/user-admin-api.yaml](./contracts/user-admin-api.yaml).

---

## Test-isolation delta (Decision 5)

`src/server/jestSetupAfterEnv.ts` `afterEach` gains, after the existing session/user cleanup:

```sql
UPDATE "user"
   SET "deactivatedAt" = NULL, admin = true
 WHERE LOWER(email) = $adminEmail OR id = $MOCK_USER_ID;
```

so a test that deactivated or demoted a spared row (seeded admin / mock admin) does not leak into the
next test.
</content>
