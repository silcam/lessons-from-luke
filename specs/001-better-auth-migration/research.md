# Phase 0 Research: Better-Auth Migration

**Feature**: `001-better-auth-migration`
**Date**: 2026-06-05
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves every "NEEDS CLARIFICATION" / "Deferred to Planning" item from the
spec and brainstorm. Findings were verified against the actually-published packages
(`better-auth@1.6.14`, `@noble/hashes@2.2.0`, `pg@8.21.0`, `kysely@0.29.2`) and the current
codebase on `001-better-auth-migration`, not against the reference plan's older assumptions.

The reference implementation plan
(`/Users/eykd/.claude/plans/please-investiagte-the-auth-rippling-stearns.md`) is followed for
product behavior, but three of its technical choices are **superseded** here per the spec's
clarifications (own isolated driver; no Drizzle). Each supersession is recorded below.

---

## Decision 1 — Isolated auth DB adapter: native `pg` Pool (no Drizzle)

- **Decision**: Give better-auth its own `pg` (`node-postgres`) `Pool` and pass it directly to
  better-auth's `database` option. better-auth's built-in Kysely adapter handles the rest. Do
  **not** add `drizzle-orm`, do **not** write an `authSchema.ts`, do **not** touch the domain
  porsager `postgres@1.0.2` driver.
- **Rationale**:
  - The domain layer is pinned to porsager `postgres@1.0.2` (verified in `yarn.lock`:
    `postgres@npm:^1.0.2 → 1.0.2`). `drizzle-orm/postgres-js` targets `postgres@3`, so the
    reference plan's Drizzle + postgres-js choice would have forced a risky 1→3 bump across
    `PGStorage.ts`, `migrations/_helpers.js`, and the test-storage classes. The spec
    explicitly rejects that (FR-012, clarification 2026-06-05).
  - **Verified**: `@better-auth/core`'s `database?` option union accepts a `PostgresPool`
    directly (`node_modules/@better-auth/core/dist/types/init-options.d.mts:404`:
    `database?: (PostgresPool | MysqlPool | ... | Dialect | { dialect; type } | { db: Kysely; type } | ...)`).
    Passing a `pg.Pool` is a first-class, supported shape — better-auth wraps it in its
    internal Kysely Postgres dialect. No separate adapter package is needed.
  - A `pg.Pool` is its own TCP connection pool, fully isolated from the porsager driver. This
    satisfies the constitution's server-only-infrastructure exemption (Principle VI v1.1.0) and
    FR-012 (auth owns its own connection; domain data-access path unchanged).
- **Alternatives considered & rejected**:
  - _Drizzle + `drizzle-orm/postgres-js` (reference plan's choice)_: requires `postgres@3`;
    rejected — would bump the domain driver. **Superseded.**
  - _better-auth `kysely-adapter` import path_: better-auth 1.6.14 does **not** publicly export
    `better-auth/adapters/kysely` (verified: `ERR_PACKAGE_PATH_NOT_EXPORTED`). Its public adapter
    exports are `./adapters` (index), `./adapters/drizzle`, `./adapters/prisma`,
    `./adapters/mongodb`, `./adapters/memory`, plus `./db/adapter`. Kysely is only reachable as
    the _default internal_ adapter when you hand it a Pool/Dialect — which is exactly the path
    chosen above. So "use the Kysely adapter explicitly" is not an available API; "hand it a pg
    Pool" is.
  - _Standalone Kysely instance (`{ db: Kysely, type: 'postgres' }`)_: also supported, but adds a
    `kysely` direct dependency and ceremony for no benefit over passing the `pg.Pool`. Rejected
    for simplicity (KISS, Principle VII).
- **Resulting dependency delta** (resolves "new auth-only DB dependency" from spec Dependencies):
  - **Add**: `better-auth@^1.6.14`, `pg@^8.21.0`, `@types/pg@^8.20.0`.
  - **Remove**: `cookie-session@^2.1.0`, `@types/cookie-session@^2.0.37`.
  - **Not added** (supersedes reference plan): `drizzle-orm`, `@noble/hashes` (Node 24 built-in supersedes).
  - **Untouched**: `postgres@^1.0.2` (domain driver) stays at v1.

## Decision 2 — Password hashing: Node 24 built-in `crypto.argon2Sync` (supersedes `@noble/hashes` plan)

- **Decision**: Implement Argon2id hashing via Node 24's built-in `crypto.argon2Sync` (available
  since Node 22.13 / 24.x). The `passwordHasher.ts` runtime module uses
  `require("crypto").argon2Sync` with parameters `{ passes: 2, memory: 19456, parallelism: 1, tagLength: 32 }`.
  The migration's inline `hashPassword` helper uses the identical call path in CommonJS. Hash string
  format: `argon2id$<m>$<t>$<p>$<saltHex>$<hashHex>` — identical between the runtime hasher and
  the migration, so the seeded credential verifies at sign-in time.
  The `passwordHasher` is wired into better-auth via
  `emailAndPassword.password = { hash, verify: ({ hash, password }) => passwordHasher.verify(hash, password) }`.
- **Rationale / drift correction**:
  - **Original plan** (this document, before implementation) selected `@noble/hashes@^2.2.0`. During
    implementation it was discovered that Node 24 already ships `crypto.argon2Sync` natively,
    removing the need for a third-party dependency entirely. `@noble/hashes` was **not added** to
    `package.json`.
  - **Verified working** under Node 24: `crypto.argon2Sync("argon2id", { message, nonce, passes: 2, memory: 19456, parallelism: 1, tagLength: 32 })` returns a 32-byte `Buffer`.
  - Argon2id (memory-hard) directly satisfies FR-001 / SC-003 (one-way hash, never plaintext).
  - `@types/node@20` does not yet declare `argon2Sync`; `passwordHasher.ts` uses a `require`-time
    cast to supply the type annotation without blocking compilation.
- **Alternatives considered**:
  - _`@noble/hashes@^2.2.0` (original plan)_: pure-JS, no build step. Superseded by the Node 24
    built-in; no third-party dependency needed.
  - _`argon2` native addon_: rejected — native build adds CI/Docker/electron-builder friction.
  - _better-auth's default scrypt hasher_: rejected — spec mandates Argon2id specifically (FR-001),
    and a shared format is required between the migration seed and runtime verify.
- **Constraint carried to design**: the migration runner is plain CommonJS (`migrations/*.js`);
  `crypto.argon2Sync` is available on the global `require("crypto")` object in Node 24 without any
  ESM/CJS conflict, so no special import gymnastics are needed.

## Decision 3 — `better-auth` server wiring & middleware order

- **Decision**: In `serverApp.ts`, mount the better-auth handler **before** `bodyParser.json`:
  `app.set("trust proxy", 1)` → `app.all("/api/auth/*", toNodeHandler(getAuth()))` →
  `bodyParser.json` → `app.use("/api/admin", requireAdmin)`. Remove `cookie-session` and
  `usersController` entirely.
- **Rationale**:
  - **Verified**: `better-auth/node` exports exactly `{ toNodeHandler, fromNodeHeaders }`.
    `toNodeHandler` consumes the raw request stream, so it must run before any body parser, else
    auth POST bodies are drained.
  - Current `serverApp.ts:35-37` registers `cookieSession` then `bodyParser` then
    `requireUser` on `/api/admin`. The rewrite swaps `cookieSession` for the auth handler and
    `requireUser` for `requireAdmin` (admin endpoints need 401-vs-403 distinction per FR-004).
- **Alternatives considered**: mounting after bodyParser with a raw-body shim — rejected as
  fragile; better-auth documents the before-bodyParser order.

## Decision 4 — `requireAdmin` / `requireUser` middleware via `getSession`

- **Decision**: `loadSession(req)` calls
  `getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) })` and attaches `req.user`
  (with the `admin` boolean) and `req.authSession`. `requireUser` → 401 if no user.
  `requireAdmin` → 401 if no user, 403 if `req.user.admin !== true`. Augment
  `express-serve-static-core` `Request` with optional `user` / `authSession` typed fields.
- **Rationale**: Directly encodes FR-004 / US2 (401 anon, 403 non-admin, 200 admin). Using
  `getSession` server-side avoids trusting client claims. Middleware is pure imperative logic →
  unit-testable by mocking `getAuth()` (Principle I).
- **Alternatives considered**: trusting a cookie-derived flag — rejected (spoofable; violates the
  401/403 contract under inspection).

## Decision 5 — Test isolation for auth rows written outside the transaction

- **Decision**: In `src/server/jestSetupAfterEnv.ts`, after each test's
  `rollbackTransaction()`, run `DELETE FROM "session"; DELETE FROM "verification";` on a root
  (non-transactional) SQL connection. Also clear any non-seed `user`/`account` rows inserted by a
  test (the seeded admin is created by migration and must persist; tests that add a non-admin user
  must clean it up, or the afterEach scopes deletes to non-seed emails).
- **Rationale / resolves spec deferred item**: better-auth writes `session`/`verification` rows on
  **its own `pg.Pool`** (Decision 1) — a connection separate from `TransactionalTestStorage`'s
  porsager transaction. Those rows therefore **survive** the per-test rollback and would
  accumulate, breaking isolation (one test's session leaking into the next). A targeted post-rollback
  cleanup on the auth tables restores isolation without touching the domain rollback machinery.
- **Alternatives considered**:
  - _Wrap auth in the same transaction_: impossible — different driver/connection; defeats the
    isolation point of having a separate pool. Rejected.
  - _`TRUNCATE ... CASCADE` on all four auth tables each test_: would delete the seeded admin and
    break `loggedInAgent()`. Rejected. Cleanup must spare the migration-seeded admin
    `user`/`account` rows; only `session`/`verification` (and test-created non-admin users) are
    cleared.

## Decision 6 — Coverage strategy for declarative/glue auth files (95% gate)

- **Decision**: Cover behavior-bearing auth code with real tests; exclude only genuinely
  declarative/glue files via `collectCoverageFrom` negations in `jest.config.js`, with justification.
  - **Real unit tests**: `passwordHasher.ts` (hash/verify round-trip, format), `requireUser.ts`
    (`requireUser`/`requireAdmin` 401/403/next via mocked `getAuth`), the `secrets.ts` fail-fast
    branches (missing `adminEmail` in production; short `cookieSecret`).
  - **Integration test** (`auth.integration.test.ts`, not counted in the unit `test` job): the real
    sign-in / get-session / sign-out / 401 / 403 / 200 flows against the test DB.
  - **Documented `collectCoverageFrom` exclusions** (mirroring the existing pattern that already
    excludes `sampleSecrets.ts`, `jestGlobalSetup.ts`, etc.): the `getAuth()` factory file
    (`src/server/auth/auth.ts`) is configuration glue around the better-auth constructor and an env
    switch; its meaningful behavior (login/guard) is exercised by the integration test, which does
    not feed the unit coverage report. Exclude `src/server/auth/auth.ts` from `collectCoverageFrom`
    with a comment, consistent with the constitution's "declarative/external-binary surfaces are
    verified by the appropriate higher layer" carve-out (Principle I, integration tier).
  - The web `authClient.ts` (better-auth React client construction) is analogous client glue;
    exclude it like the existing `webApp.tsx`/`MainRouter.tsx` exclusions, since its behavior is
    exercised through the rewritten `currentUserSlice` thunks (which mock `authClient`) and Cypress.
- **Rationale**: Keeps the 95% gate honest — imperative logic is unit-tested; only thin
  constructor/config glue (whose real behavior the integration + E2E tiers cover) is excluded, each
  with a written justification. No `istanbul ignore` on normal code paths (Principle I).
- **Alternatives considered**: chasing 95% by unit-testing the better-auth constructor with deep
  mocks — rejected as low-value ritual coverage that tests the mock, not reality (Zeroth Principle).

## Decision 7 — `cookieSecret` minimum length (fail-fast)

- **Decision**: better-auth requires a `secret` of **≥ 32 chars**. The `getAuth()` factory (and/or
  `secrets.ts`) MUST throw at startup if `secrets.cookieSecret.length < 32`. Raise the
  `defaultSecrets.cookieSecret` and `sampleSecrets.cookieSecret` to a ≥ 32-char value, and document
  the requirement in `CLAUDE.md`.
- **Rationale / resolves spec deferred item**: **Verified** the current default
  `cookieSecret` is `"fuerabgui4pab5m32;tkqipn84"` = **26 chars** — below the threshold. Without a
  fail-fast check the server would start in (or fall back to) an insecure/invalid state, violating
  FR-011 (fail fast when config too weak) and the edge case "weak/short configuration".
- **Alternatives considered**: silently padding/deriving a longer secret — rejected; hides
  misconfiguration (Zeroth Principle: reveal errors early).

## Decision 8 — `BETTER_AUTH_URL` / cookie-origin alignment in dev

- **Decision**: `getAuth()` sets `baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:8081"`
  (the API origin). In dev, webpack-dev-server (`:8080`/`:8082`) proxies `/api/*` to the API
  (`:8081`), so cookies set on the proxy target reach the browser correctly; the web `authClient`
  uses `baseURL: window.location.origin`. Cookie attributes: in plain-HTTP localhost use prefix
  `better-auth` and `secure:false`; otherwise `__Host-better-auth` with `secure:true`. Validate in
  the dev smoke step of quickstart; if cookies misalign, set `BETTER_AUTH_URL=http://localhost:8080`.
- **Rationale / resolves spec deferred item**: aligns the cookie-issuing origin with the origin the
  browser hits, the root cause of the reference plan's Risk #10. Production sets `BETTER_AUTH_URL`
  to the public HTTPS origin → host-locked `__Host-` secure cookie (FR-010).
- **Alternatives considered**: hardcoding `:8080` — rejected; the API authoritatively runs on `:8081`
  and production differs. Env-driven is correct.

## Decision 9 — `User.id: number → string` ripple (single cohesive commit)

- **Decision**: Change `User.id` to `string` in `src/core/models/User.ts` and land every dependent
  edit in **one commit** so the full-project typecheck (core → server → frontend → desktop) stays
  green (Principle IV gate runs the whole-project `tsc`). `LoginAttempt` switches `username → email`.
- **Verified ripple inventory** (grep across `src/`):
  - `src/core/models/User.ts` — the type itself (`id: number → string`, `username → email`).
  - `src/frontend/common/state/currentUserSlice.ts` + `.test.ts` — thunks rewritten;
    `.test.ts` is the **only** file with an `id: 1` numeric literal (→ `id: "u1"`).
  - `src/frontend/web/home/PublicHome.tsx` + `.test.tsx` — `username` field → `email`.
  - `src/frontend/web/home/AdminHome.tsx`, `src/frontend/web/MainRouter.tsx` — switch from
    `usePush`/`useLoad` custom signatures to plain thunk dispatch (thunks change shape).
  - `src/server/controllers/usersController.ts` (+ `.test.ts`) — **deleted** (legacy admin).
  - `src/server/middle/requireUser.ts` (+ `.test.ts`) — rewritten.
  - **`src/desktop/**`— zero references** to`User.id`, `currentUser`, `/api/users`, `cookie-session`,
`better-auth`, or `authClient` (verified by grep — empty result). US5 / SC-005 hold by
    construction; no desktop file changes.
  - `src/core/interfaces/Api.ts` — defines `/api/admin/*` routes (unaffected by the id type; admin
    gating is enforced by middleware, not the route map). The legacy `/api/users/*` map entries (if
    any) are removed with `usersController`.
- **Rationale**: The reference plan's Risk #1 is confirmed contained — the numeric `id: 1` literal
  exists in exactly one (test) file, and no production code joins on `user.id`. The migration is
  small and safe to land atomically.

## Decision 10 — DDL migration + idempotent admin seed (own driver, CommonJS)

- **Decision**: Two new `migrations/<unix-ms>-*.js` files using the existing `makeDbConnect` helper
  (porsager `postgres`, which the runner already loads — note: the _migration_ uses the existing
  helper to create the four better-auth tables; only the _runtime server_ uses the `pg.Pool`). The
  DDL creates `user` / `session` / `account` / `verification` with better-auth's opinionated column
  names (do not rename) and `user.admin boolean not null default false`. The seed reads
  `secrets.json` via `fs`, hashes `secrets.adminPassword` with the inline Argon2id helper
  (`@noble/hashes/argon2.js`), inserts one `user` (`admin:true`) + one `account`
  (`providerId:'credential'`, `accountId = user.id`, `password = <hash>`). Idempotent: skip if a
  `user` with `secrets.adminEmail` exists; throw loudly if `adminEmail` missing.
- **Rationale**: Satisfies FR-002/FR-003 (no public sign-up; idempotent bootstrap; loud on missing
  config) and US4. Using `makeDbConnect` for the DDL keeps the migration consistent with every other
  migration and the `migrate` runner's CommonJS contract; the table names/shapes match what the
  runtime `pg.Pool` + better-auth Kysely adapter expect. The seed's hash format must byte-match
  `passwordHasher.ts` so runtime verification succeeds.
- **Clarification — two drivers, one schema**: the _migration_ creating the tables may use the
  porsager helper (it is server-only DDL, not domain data-access), while the _running auth backend_
  reads/writes those tables through its **own** `pg.Pool`. Neither path alters the domain
  data-access code (`PGStorage`, `_helpers.js`), satisfying FR-012 / SC-007. (If preferred at
  implementation time, the migration may instead use a throwaway `pg` client; either is acceptable
  since the migration is one-shot DDL, not the domain runtime path. Recorded as an implementation
  detail, not a product decision.)

---

## Summary of supersessions vs. the reference plan

| Reference plan said                          | This plan does (per spec clarifications)                          |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Drizzle + `drizzle-orm/postgres-js` adapter  | Native `pg.Pool` passed to better-auth `database` (no Drizzle)    |
| Possibly bump domain `postgres@1 → 3`        | Domain `postgres@1.0.2` untouched; auth gets isolated `pg`        |
| `authSchema.ts` (Drizzle schema)             | Deleted/never created — DDL migration is the single schema source |
| `@noble/hashes/argon2` / `/utils` (v1 paths) | `@noble/hashes/argon2.js` / `/utils.js` (v2 export map)           |
| `@noble/hashes@^1.5.0`                       | `@noble/hashes@^2.2.0`                                            |
| target branch `feature/node-24-migration`    | target `master` (node-24 already merged)                          |

All "Deferred to Planning" items from the spec are now resolved. No open NEEDS CLARIFICATION remain.
