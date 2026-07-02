---
date: 2026-07-02
topic: user-account-management
---

# User Account Management (admin roster + role & access control)

## Problem Frame

The invitation system (`002-invitation-system`) gave admins a way to **onboard** people:
issue an email-bound, role-scoped, single-use link that creates an account. But there is a
matching gap the invitation brainstorm explicitly deferred: **"No management of existing
accounts (deactivate / remove / change role of a user that already exists) — account management
is future work."** This feature is that future work.

Today, once an account exists there is **no way to see the account roster, change a user's role,
or revoke their access** short of raw SQL against the auth database. Concretely:

- There are **zero** user-account management endpoints — the legacy `/api/users/*` was removed in
  the better-auth migration and nothing replaced it.
- Roles are a single `user.admin` boolean. Invitations can grant admin or standard at creation,
  but a role can never be changed afterward.
- If a team member leaves, or an account is compromised or shared, the admin cannot offboard them,
  demote them, or force them to sign out.

So the primary job of this feature is **access control** — role changes and offboarding — with the
account **roster** as the surface that makes those actions possible. It is the offboarding
counterpart to invitation onboarding.

Participants: the **admin** (views the roster, changes roles, revokes access) and the
**server auth subsystem** (owns the `user`/`session` tables on the isolated auth connection and
enforces the changes). The Electron desktop client is **not involved** — it keeps per-translation
access-code auth.

## Operations at a glance

| Operation             | What it does                                                | Reversible? | Guardrail                                                    |
| --------------------- | ----------------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| View roster           | List all accounts (name, email, role, status, created)      | —           | Read-only                                                    |
| Change role           | Promote standard → admin, or demote admin → standard        | Yes         | Cannot demote the **last** admin                             |
| Deactivate access     | Block sign-in + revoke active sessions; account is retained | Yes         | Cannot deactivate the **last** admin or **your own** account |
| Reactivate access     | Restore a deactivated account's ability to sign in          | Yes         | —                                                            |
| Force sign-out (opt.) | Revoke a user's sessions without deactivating the account   | Yes (relog) | —                                                            |

## Requirements

**Roster (view)**

- R1. An admin MUST be able to view a list of **all** user accounts showing: display name,
  email, **role** (Admin / Standard), **status** (Active / Deactivated), and **created date**.
- R2. The roster MUST clearly indicate the admin's **own** account (self), so consequential
  actions on self are visible.

**Role management**

- R3. An admin MUST be able to **promote** a Standard user to Admin and **demote** an Admin to
  Standard (toggle the `admin` flag).
- R4. The system MUST **prevent demoting the last remaining admin** (no path to zero admins).

**Access control (offboarding)**

- R5. An admin MUST be able to **deactivate** an account. A deactivated user MUST be unable to
  sign in, and their **active sessions MUST be revoked immediately**.
- R6. An admin MUST be able to **reactivate** a deactivated account, restoring sign-in.
- R7. Deactivated accounts MUST **remain in the roster** (shown as Deactivated) for audit —
  they are **not hard-deleted**.
- R8. The system MUST **prevent deactivating the last remaining admin** and MUST **prevent an
  admin from deactivating their own account** (self-lockout guard).

**Force sign-out (secondary)**

- R9. An admin SHOULD be able to **revoke a user's active sessions** without deactivating the
  account (force re-login), e.g. for a shared or suspicious session.

**Safety & consistency**

- R10. All user-management endpoints and screens MUST be **admin-only** — **401** when logged
  out, **403** for a non-admin — consistent with the existing `/api/admin/*` namespace; mutating
  requests MUST enforce same-origin, matching the invitation controller.
- R11. Consequential actions (demote, deactivate, revoke sessions) MUST require an explicit
  **confirmation step**, consistent with the invitation "Retract" two-click confirm.
- R12. The **Electron desktop client MUST remain untouched**; user-management UI and endpoints
  stay web/server-only, and the isolated auth infrastructure MUST NOT leak into the isomorphic
  `core` or the desktop path (constitution Principle VI server-only exemption; the domain
  `postgres@1.0.2` driver stays untouched).

## Success Criteria

- An admin opens the user-management screen and sees **every** account with its role and status.
- An admin promotes a Standard user to Admin and demotes them back; the **last admin cannot be
  demoted**.
- An admin deactivates a departing user: that user's **sessions end immediately** and they
  **cannot sign back in**; the admin reactivates them and sign-in works again.
- An admin **cannot** deactivate/demote the last admin, and **cannot** lock themselves out.
- All routes enforce **401 / 403 / 200**; desktop and the domain storage driver are untouched;
  full CI is green.

## Scope Boundaries

- **No hard delete of accounts.** Offboarding is a reversible **deactivate**. Rationale: the
  `invitation.invitedBy` column references `user(id)` with **no cascade**, so hard-deleting an
  admin who issued invitations would violate the FK anyway; and the invitation system already
  chose to soft-retain terminal records for audit. Deactivate is the consistent, safer primitive.
- **No admin-initiated password reset.** It would need a token/link flow like invitations (and
  there is no email sending). The practical need is covered by deactivate + re-invite. Future work.
- **No editing another user's name/email** from this screen.
- **No unified "People" area** merging the invitations and users screens for v1 — a separate
  sibling screen keeps consistency over novelty. Unifying is a possible future enhancement.
- No bulk actions, no CSV, no email notifications, no OAuth, no impersonation.
- No desktop auth changes.

## Key Decisions

- **Offboard by reversible deactivate, not hard delete** — preserves the `invitedBy` audit chain
  (RESTRICT FK), mirrors invitation soft-retain, is reversible, and still fully cuts access
  (blocks sign-in + kills sessions).
- **Keep the existing `admin` boolean as the role model** — do **not** adopt better-auth's admin
  plugin `role` string / `banned` columns, which would fork the model. Toggling the boolean is the
  role mechanism; deactivation is a separate new state.
- **Separate sibling screen** mirroring the invitation admin pattern (a `user?.admin`-gated route,
  a nav entry alongside "Invitations" in `AdminHome`, built from the base-components kit +
  `Colors.ts`), rather than restructuring into a combined area.
- **Two structural guardrails baked in**: never reach zero admins (R4, R8), and never let an admin
  lock themselves out (R8).
- **Ratified 2026-07-02**: the operation set above (roster + role change + deactivate/reactivate +
  optional force-sign-out; **no** hard delete, **no** admin password reset), offboarding by
  reversible deactivate, and a separate `/admin/users` screen were all confirmed by the product
  owner. No blocking product decisions remain.

## Dependencies / Assumptions

- Builds directly on `001-better-auth-migration` and `002-invitation-system`: the `user`/`session`
  tables, `getAuthPool()` isolated connection, `requireAdmin` middleware, and the `user.admin`
  boolean. Per the stacked-PR convention, this branch is stacked on the most recent unmerged auth
  branch, not `master` (confirm the exact parent at specify time).
- Deactivation introduces **new persisted state** on the `user` table (e.g. a `deactivatedAt` /
  `disabled` column) and a new enforcement point in the sign-in / session-load path — the existing
  schema has no `disabled`/`banned`/`role` column.
- Sessions are DB-backed and keyed by `userId` (cascade with the user), so session revocation is a
  straightforward `DELETE FROM "session" WHERE "userId" = $1`.
- A valid `secrets.json` continues to be present wherever migrations run (CI, Docker, deploy).

## Outstanding Questions

### Resolve Before Specify

- _(none — the operation set, offboarding-by-deactivate, and separate-screen decisions were
  ratified 2026-07-02; see Key Decisions.)_

### Deferred to Planning

- [Affects R5][Technical] Exact deactivation schema (`deactivatedAt timestamptz` vs `disabled
boolean`) and **where** it is enforced — the better-auth email sign-in path must reject a
  deactivated user, and `loadSession` should treat them as unauthenticated.
- [Affects R3][Technical] How a **role change propagates to an active session** — the `admin` flag
  is carried in the session; decide whether promotion/demotion takes effect immediately (revoke +
  refresh) or on next sign-in.
- [Affects R3,R5][Needs research] Whether to **enable the better-auth admin plugin** (present on
  disk but unconfigured; brings `listUsers`/`banUser`/`setRole`/`revokeUserSessions`) or hand-roll
  the endpoints. The plugin's `role` string + `banned` columns likely conflict with the existing
  `admin` boolean — leaning hand-rolled for consistency, but confirm during planning.
- [Affects R4,R8][Technical] Implement the **last-admin guard** as a transactional count to avoid
  a race where two concurrent demotions/deactivations both pass the check.
- [Affects R7][Technical] **Test isolation**: user-mutation tests must respect the jest `afterEach`
  that deletes all users except the seeded admin (and, if a `deactivatedAt` column is added, reset
  it between tests).
- [Affects R1][Technical] Choose the frontend data path: `createAsyncThunk` + `fetch` (invitation
  precedent) or `RequestContext` + Redux slice (languages/lessons precedent).

## Next Steps

- → `/sp:02-specify` to create the formal specification — branch stacked on the current auth
  feature branch, beads epic, and dependency chain.
