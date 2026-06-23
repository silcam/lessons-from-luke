# Quickstart: Better-Auth Migration

**Feature**: `001-better-auth-migration`
**Date**: 2026-06-05

This is the developer/operator verification path for the better-auth migration. It mirrors the
spec's acceptance scenarios and the constitution's multi-layer verification (unit → integration →
E2E). Run from repo root unless noted.

## Prerequisites

1. **Dependencies installed** (use yarn): `better-auth`, `pg`, `@types/pg`, `@noble/hashes` added;
   `cookie-session` + `@types/cookie-session` removed; `postgres@1.0.2` (domain driver) unchanged.

   ```bash
   yarn install
   ```

2. **`secrets.json` has the new fields** wherever migrations run (CI, Docker entrypoint, deploy host):

   ```jsonc
   {
     "cookieSecret": "<at least 32 characters — fail-fast rejects shorter>",
     "adminEmail": "admin@example.com",
     "adminPassword": "<strong password, >= minPasswordLength>",
     "db": { "database": "lessons-from-luke", "username": "...", "password": "..." },
     "testDb": { "database": "lessons-from-luke-test", "username": "...", "password": "..." },
     "devDb": { "database": "lessons-from-luke-dev", "username": "...", "password": "..." },
   }
   ```

   - `cookieSecret` MUST be ≥ 32 chars (the old 26-char default is rejected — FR-011).
   - `adminEmail` is REQUIRED in production; startup fails loudly if missing.
   - `adminUsername` / `adminPassword`-plaintext-comparison are gone; `adminUsername` is vestigial.

3. **Env var** (optional in dev, required-correct in prod):
   `BETTER_AUTH_URL` — the public origin the browser hits. Defaults to `http://localhost:8081`.

## 1. Schema + seed (US4, FR-003)

```bash
yarn migrate:test     # (or migrate:dev / migrate for the respective env)
```

Verify (psql against `lessons-from-luke-test`):

```sql
\d "user"          -- has columns incl. admin boolean
\d "session"
\d "account"
\d "verification"
SELECT email, admin FROM "user";                 -- exactly one row, admin = true
SELECT "providerId", left(password, 8) FROM "account";  -- providerId='credential', password starts 'argon2id'
```

**Idempotency** (US4 scenario 2):

```bash
yarn migrate:test     # re-run — no error; seed logs "admin exists, skipping"
```

**Missing config** (US4 scenario 3): temporarily remove `adminEmail` → migrate fails loudly.

## 2. Unit + middleware tests (US1, US2 — FR-001, FR-004)

```bash
yarn test:once        # server + frontend unit suites, runInBand
```

Covers (Principle I, unit tier):

- `passwordHasher.test.ts` — Argon2id hash/verify round-trip; format `argon2id$m$t$p$salt$hash`.
- `requireUser.test.ts` — `requireUser` 401 when no session; `requireAdmin` 401 / 403 / next
  (mocking `getAuth()`).
- `secrets.test.ts` — fail-fast on short `cookieSecret`; on missing `adminEmail` in production.
- `currentUserSlice.test.ts` — thunks dispatch on mocked `authClient`; `id: "u1"` string literal.
- `PublicHome.test.tsx` — email input field.

## 3. Integration tests (US1/US2/US3 against real DB)

```bash
yarn test:integration     # runs *.integration.test.ts (CI `integration` job)
```

`auth.integration.test.ts` asserts:

- `GET /api/auth/get-session` → `null` when unauthenticated.
- `POST /api/auth/sign-in/email` wrong password → **401**, no session (US1 scenario 2).
- `POST /api/auth/sign-in/email` correct admin creds → 200 + session; `get-session` returns the
  admin (`admin:true`) (US1 scenario 1).
- `POST /api/auth/sign-out` → session cleared; subsequent `get-session` → `null` (US3).
- `GET /api/admin/languages` → **401** logged out (US2 scenario 1).
- `GET /api/admin/languages` → **403** for a non-admin session (insert non-admin via raw SQL)
  (US2 scenario 2).
- `GET /api/admin/languages` → **200** with the seeded admin's `loggedInAgent()` (US2 scenario 3).

**Test isolation check**: run the suite twice / in random order — no session-row leakage between
tests (afterEach deletes `session`/`verification`; spares the seeded admin).

## 4. Dev smoke (FR-007, FR-010, BETTER_AUTH_URL alignment)

```bash
yarn migrate:dev && yarn seed-dev-docs && yarn dev-web
# browse http://localhost:8081 (or :8080 via webpack)
```

- `/api/auth/get-session` → `null` before login.
- Submit the sign-in form with **admin email** + password → land on `AdminHome`.
- Cookie `better-auth.session_token` present (dev) / `__Host-better-auth.session_token` (prod-like).
- `/api/auth/get-session` → `{ user: { id, email, admin: true }, session: {...} }`.
- `/api/admin/languages` → 200; **Log out** → `/api/admin/languages` → 401.
- Wrong password → `Login failed` UI, no cookie (US1 scenario 2). The error does not reveal whether
  the email exists (FR-007).
- If cookies misalign across :8080/:8081, set `BETTER_AUTH_URL=http://localhost:8080` (research D8).

## 5. Web E2E (Cypress `e2e` job — US1/US3)

```bash
yarn test-e2e
```

- `cypress/integration/login.spec.js` — uses the **email** field (placeholder `Email`), correct
  creds log in, log out returns to the login screen.
- `cypress/support/commands.js` `cy.login` — POSTs to `/api/auth/sign-in/email` with
  `adminEmail`/`adminPassword` (was `/api/users/login` with `chris`/`yo`). Used by `adminLessons`,
  `adminLanguages`, `translate` specs.

## 6. Desktop non-regression (US5, SC-005 — FR-008)

```bash
yarn dev-desktop      # exercise an existing translation by access code
grep -rE "better-auth|authClient|/api/users|cookie-session" src/desktop   # → no matches
yarn test-desktop-e2e-deps   # Playwright `desktop-e2e` job stays green
```

## 7. Production cookie shape (FR-010)

With `BETTER_AUTH_URL=https://example.org` and `NODE_ENV=production`, the session cookie is
`__Host-better-auth.session_token` with `Secure; HttpOnly; SameSite=Lax; Path=/`.

## Full CI gate (Principle IV)

All jobs green: `static-checks` (lint + prettier + whole-project typecheck), `test`, `integration`,
`e2e`, `desktop-e2e`, `build_on_mac`. The whole-project typecheck proves the `User.id: number →
string` ripple landed cohesively (SC-007). The domain `postgres@1.0.2` driver, `PGStorage.ts`, and
`migrations/_helpers.js` are unchanged (SC-007).
