# Quickstart: User Account Management

**Feature**: `006-user-account-management` | **Date**: 2026-07-02
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is the admin-only account roster and access-control surface — the offboarding counterpart to the
`002` invitation onboarding flow. It is **web/server only**; the desktop client and the isomorphic
`core` are untouched.

## Prerequisites

- `001-better-auth-migration` and `002-invitation-system` are merged (this branch bases on `master`).
- A valid `secrets.json` (with `adminEmail`/`adminPassword` for the seeded admin) is present wherever
  migrations run (CI, Docker, deploy).
- Run the new migration: `yarn migrate` (prod), `yarn migrate:test` (Jest/integration),
  `yarn migrate:dev` (dev). It adds the nullable `user.deactivatedAt` column.

## What it adds

| Layer     | New / changed                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Migration | `<ts>-AddUserDeactivatedAt.js` — `ALTER TABLE "user" ADD COLUMN "deactivatedAt" timestamptz`                                            |
| Server    | `src/server/auth/userStore.ts`, `src/server/auth/userValidation.ts`, `src/server/controllers/usersController.ts`                        |
| Server    | `auth.ts` gains `databaseHooks.session.create.before` (sign-in rejection); `requireUser.ts` `loadSession` gains a `deactivatedAt` check |
| Contract  | `src/core/interfaces/Api.ts` gains `UserAccountRow` + the `/api/admin/users*` route entries                                             |
| Frontend  | `src/frontend/web/users/UsersList.tsx` + `usersListThunks.ts`; a nav link in `AdminHome.tsx`; a route in `MainRouter.tsx`               |
| Tests     | `jestSetupAfterEnv.ts` `afterEach` resets spared rows' `deactivatedAt`/`admin`                                                          |

## Manual walkthrough (dev)

1. `yarn migrate:dev && yarn reset:dev` then `yarn dev-web`.
2. Sign in as the seeded admin; from Home, click **Users** (next to Invitations).
3. Confirm the roster lists every account with name, email, role, status, created date, and your own
   row marked as self.
4. Invite a second account (Invitations screen) and redeem it, so there are ≥ 2 accounts to act on.
5. **Change role**: promote the Standard user → they gain admin on their next request; demote back.
   Demoting the _only_ admin is refused with a clear message.
6. **Deactivate**: deactivate the second account (confirm the two-step prompt). Its live session stops
   being authenticated on the next request, and it can no longer sign in. Reactivate → sign-in works.
7. **Force sign-out**: revoke the second account's sessions; it is signed out but stays Active and can
   sign back in.
8. Guardrails: you cannot deactivate your own account, and you cannot deactivate/demote the last admin.

## Test entry points

- **Unit** (`*.test.ts`, real test DB via `loggedInAgent()`/`plainAgent()` + better-auth CJS mock):
  `userStore.test.ts`, `userValidation.test.ts`, `usersController.test.ts`, `requireUser.test.ts`
  (deactivated session-load rejection), frontend `UsersList.test.tsx`, `usersListThunks.test.ts`.
- **Integration** (`*.integration.test.ts`, real better-auth child server): sign-in rejection of a
  deactivated user via `databaseHooks.session.create.before`; deactivate revokes a live session;
  reactivate restores sign-in; concurrent last-two-admin demote/deactivate (one refused).
- **Acceptance** (ATDD outer loop): `specs/acceptance-specs/US09..US12-*.txt` (created in `sp:05-tasks`).

Run: `yarn typecheck && yarn lint && NODE_ENV=test npx jest --runInBand` and
`yarn test:integration`.

## Guardrail cheat-sheet

| Attempt                                   | Result                             |
| ----------------------------------------- | ---------------------------------- |
| Demote the last active admin              | `409 LAST_ADMIN`, no change        |
| Deactivate the last active admin          | `409 LAST_ADMIN`, no change        |
| Deactivate your own account               | `409 SELF_DEACTIVATION`, no change |
| Deactivate an already-deactivated account | `200`, no-op (idempotent)          |
| Force-sign-out with no sessions           | `200`, `revoked: 0`                |
| Unauthenticated request to any route      | `401`                              |
| Standard (non-admin) request to any route | `403`                              |

</content>
