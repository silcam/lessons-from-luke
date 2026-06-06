---
date: 2026-06-05
topic: better-auth-migration
---

# Better-Auth Migration (Re-application against current master)

## Problem Frame

The server ships placeholder auth: a single hardcoded admin (`chris` / `yo`) checked in
**plaintext** against `secrets.adminUsername` / `secrets.adminPassword`, with a signed-cookie
session via `cookie-session`, **no `users` table, and no password hashing**. This is a real
security weakness and blocks any move toward multi-user, invitation-only access.

A detailed migration plan already exists (`/Users/eykd/.claude/plans/please-investiagte-the-auth-rippling-stearns.md`)
that moves the server to **better-auth** (email + password, Argon2id), invitation-only, with the
existing single admin seeded from secrets and a real boolean `admin` flag. The plan was written
against an **older master**, before the pre-commit pipeline, the expanded CI (integration / Cypress /
Playwright jobs), and the newly ratified constitution landed. This brainstorm re-validates the plan
against current master and records the decisions needed to apply it now. The **Electron desktop
client is out of scope** (it authenticates with per-translation access codes, never user sessions).

## Requirements

**Authentication behavior (affirmed from the existing plan)**

- R1. The server MUST authenticate via better-auth email + password with **Argon2id** hashing; the
  hardcoded `chris`/`yo` plaintext check and `cookie-session` MUST be removed entirely.
- R2. Sign-up MUST be disabled (invitation-only). The single admin MUST be **seeded by migration**
  from `secrets.adminEmail` + `secrets.adminPassword` (Argon2id-hashed), **idempotently** (skip if the
  admin email already exists; fail loudly if `adminEmail` is missing).
- R3. The user record MUST carry a boolean `admin` flag. `/api/admin/*` MUST return **401** when
  logged out and **403** for a non-admin session.
- R4. No OAuth and no email-based password reset in this cut.
- R5. The web frontend MUST integrate via the better-auth React client. The login form switches
  `username` → `email`; existing error handling (422 → `loginFailed` UI) MUST be preserved.
- R6. The Electron desktop client MUST remain **untouched** — it keeps per-translation access-code
  auth and never reaches a user session.

**Architecture & governance**

- R7. better-auth MUST own its tables (`user` / `session` / `account` / `verification`) through its
  **own isolated DB adapter/connection**, leaving the domain storage driver (porsager `postgres@1.0.2`,
  `PGStorage.ts`, `migrations/_helpers.js`, and the test-storage classes) **untouched**.
- R8. Constitution **Principle VI MUST be amended** (via `/sp:00-constitution`) to scope the
  `Persistence` mandate to **domain data** (languages / lessons / tStrings) and explicitly permit
  server-only auth infrastructure to own its tables. This amendment MUST land **before** the auth
  change so the auth work is constitution-conformant.
- R9. `User.id` becomes a **`string`** (better-auth-generated IDs). The full ripple MUST land
  cohesively so the **full-project typecheck** (core → server → desktop → frontend) stays green in a
  single commit — no half-migrated state.

**Quality gates & verification (new since the plan was written)**

- R10. Auth DB-layer behavior MUST be covered by an integration test named `*.integration.test.ts`
  (auto-run by the CI `integration` job). Middleware (`requireUser` / `requireAdmin`) MUST be covered
  by unit tests. New code MUST meet the **95% coverage threshold** (100% aspirational per constitution).
- R11. The **Cypress** web login spec MUST be updated for the email field and pass the CI `e2e` job;
  the **Playwright `desktop-e2e`** job MUST stay green (desktop unaffected).
- R12. New migrations MUST be **idempotent** and runnable by `yarn migrate:test` (CI runs it before
  both unit and integration suites). better-auth session/verification rows that are written on a
  connection **outside** `TransactionalTestStorage` (so they survive transactional rollback) MUST be
  cleaned up so test isolation holds.

## Success Criteria

- Admin logs in via email + password against a stored Argon2id hash; wrong password fails; logout
  clears the session.
- `/api/admin/*` enforces 401 (logged out) / 403 (non-admin) / 200 (admin).
- Plaintext `chris`/`yo` and `cookie-session` are fully removed; `grep -r "better-auth\|authClient" src/desktop`
  → no matches.
- The domain `postgres@1.0.2` driver and `PGStorage`/`_helpers.js` are unchanged.
- Constitution is amended and the auth change is conformant.
- Full CI is green: `static-checks`, `test`, `integration`, `e2e`, `desktop-e2e`, `build_on_mac`.

## Scope Boundaries

- No OAuth, no password reset, no multi-role model (boolean `admin` only) in this cut.
- No desktop auth changes.
- No legacy `/api/users/*` compatibility shims.
- No upgrade of the **domain** `postgres` driver (auth gets its own isolated driver instead).

## Key Decisions

- **Re-apply the existing plan, refreshed** for drift (line refs, `target = master` since node-24
  already merged) and the new pre-commit/CI/constitution gates — product decisions are **not** re-opened.
- **Reconcile the constitution by amending Principle VI** to domain-scope, as a prerequisite
  dependency (chosen over a documented one-off exception or wrapping auth behind `Persistence`).
- **Isolate better-auth's DB driver** (e.g. better-auth's native `pg`/Kysely adapter) rather than the
  plan's Drizzle + `postgres-js`. Rationale: the domain layer is pinned to porsager `postgres@1.0.2`
  while `drizzle-orm/postgres-js` targets `postgres@3`; isolation avoids a risky 1→3 driver bump
  across the whole storage layer. **This supersedes the plan's Drizzle adapter choice** and likely
  drops the `drizzle-orm` dependency and the Drizzle `authSchema.ts`, while the DDL migration still
  defines the four tables.

## Dependencies / Assumptions

- The Principle VI amendment (R8) lands **first** and is itself a tracked unit of work.
- A valid `secrets.json` (now including `adminEmail`) is present wherever migrations run — CI, Docker
  entrypoint, and Capistrano deploy already place one before `migrate`.
- Isolating the adapter introduces a **new auth-only DB dependency** (e.g. `pg` + `@types/pg`) instead
  of `drizzle-orm`.

## Outstanding Questions

### Resolve Before Specify

- _(none — all blocking product and architecture decisions are resolved)_

### Deferred to Planning

- [Affects R7][Needs research] Confirm the exact isolated adapter for better-auth 1.6.11 — native
  `pg` Pool / Kysely dialect vs. a standalone Kysely — and whether any Drizzle remains; validate the
  chosen adapter supports the `admin` `additionalField`.
- [Affects R12][Technical] Mechanism to stop better-auth `session`/`verification` rows (written
  outside `TransactionalTestStorage`) from surviving rollback — e.g. targeted cleanup in
  `jestSetupAfterEnv.ts`.
- [Affects R10][Technical] Coverage strategy for declarative/glue auth files (config/schema) to reach
  95% — real unit coverage vs. `collectCoverageFrom` exclusions in `jest.config.js`.
- [Affects R5][Technical] `BETTER_AUTH_URL` / cookie-origin alignment in dev (webpack `:8080` vs API
  `:8081`); confirm during dev smoke (plan Risk #10).
- [Affects R1][Technical] `secrets.cookieSecret` is 28 chars but better-auth wants ≥ 32 — add
  fail-fast validation and update the default + `sampleSecrets.ts`.
- [Affects R9][Technical] Full inventory of the `User.id: number → string` ripple across frontend/
  desktop test fixtures and any `Persistence` signatures, so it lands green in one commit.

## Next Steps

- → `/sp:02-specify` to create the formal specification (branch, beads epic, dependency chain).
- Implementation reference: `/Users/eykd/.claude/plans/please-investiagte-the-auth-rippling-stearns.md`
  (apply with the three Key Decisions above overriding the plan's Drizzle/adapter and target-branch
  assumptions).
