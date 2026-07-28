# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lessons from Luke is a Sunday School curriculum translation and management application. It supports both web and Electron desktop deployments, allowing users to translate lesson content from English source languages into other languages.

## Design Context

Before working on any UI, read **`PRODUCT.md`** (strategic: register, users, brand personality, anti-references, design principles, accessibility) and **`DESIGN.md`** (visual system: the `Colors.ts` palette, Helvetica type scale, flat/no-shadow elevation, and the `src/frontend/common/base-components/` component kit). These are the source of truth for design decisions.

- **Register: product.** Personality is _clear, efficient, utilitarian_ — North Star "The Field Manual."
- **Guiding principle: consistency over novelty.** Maintain and extend the existing visual style for new features (e.g. the invitation workflow); build from the existing base-components and tokens rather than inventing a parallel language. The invitation screens are _not_ yet a style reference — they're unfinished and should be brought up to match `DESIGN.md`.
- The `/impeccable` skill reads both files automatically. Live mode (`/impeccable live`) is **not** configured: the web build serves an in-memory HTML (webpack `HtmlWebpackPlugin` with no template file), so live mode would need a custom HTML template added to the webpack config first.

## Development Commands

```bash
# Install dependencies
yarn install

# Run migrations
yarn migrate

# Development (web)
yarn dev-web          # Starts webpack-dev-server + TypeScript watch + Express server

# Development (desktop) - requires dev-web to be running first
yarn dev-desktop      # Starts Electron app with hot reload

# Testing
yarn test            # Jest tests in watch mode
yarn test-watch      # Alias for test

# Run a single test file
npx jest path/to/file.test.ts --runInBand

# Production builds
yarn build-server    # Build for web production
yarn build-desktop   # Build Electron app

# Deployment
yarn deploy          # Capistrano production deploy
```

## Local Environment (native, on-host)

Development and tests run natively on the host — there is no Docker environment. (CI uses GitHub Actions Postgres _service containers_, which are unrelated.)

```bash
# One-time: install Node (via nvm, version from .nvmrc — currently 24) and Postgres
brew install postgresql@16
brew services start postgresql@16

# One-time: create the role and databases
createuser lessons-from-luke --createdb
psql -c "ALTER USER \"lessons-from-luke\" PASSWORD 'lessons-from-luke'"
createdb -O lessons-from-luke lessons-from-luke
createdb -O lessons-from-luke lessons-from-luke-test
createdb -O lessons-from-luke lessons-from-luke-dev

# Install dependencies (use yarn, not npm — npm can cause TypeScript resolution issues)
yarn install

# Run migrations against the test database
yarn migrate:test

# Run tests
NODE_ENV=test npx jest --runInBand

# Run tests with coverage
yarn test-coverage
```

Key details:

- Node comes from `nvm` using `.nvmrc` (currently 24), mirroring the production deploy host (`capistrano-nvm`)
- Homebrew Postgres listens on the **Unix socket** (`/tmp/.s.PGSQL.5432`), not TCP — check it with `pg_isready`, not `nc localhost 5432`. If `secrets.json` omits host/port, the domain driver connects over the socket; better-auth's separate `pg.Pool` connects over TCP to `127.0.0.1:5432`
- If `secrets.json` is absent, `defaultSecrets` (`src/server/util/secrets.ts`) supplies working local credentials for all three databases
- Migrations target databases by env var: `TEST_DB=true` → test DB, `DEV_DB=true` → dev DB, no flag → production DB. Connection info comes from `secrets.json`
- Migration state files: `.migrate-test`, `.migrate-dev`, `.migrate-prod` (one per environment, gitignored). The legacy `.migrate` file is auto-copied to `.migrate-prod` on first run for backward compatibility
- If a database is recreated/emptied and `migrate` reports `relation "languages" does not exist`, the state file thinks migrations already ran. Reset with e.g. `echo '{"lastRun":null,"migrations":[]}' > .migrate-test && yarn migrate:test`
- If you check out a branch whose `migrations/` set is _behind_ what `.migrate-test` records, `migrate` aborts with `Missing migration file: <name>`. Non-destructive fix: restore the missing migration file(s) untracked (`git show <branch>:migrations/<f> > migrations/<f>`), run the migration, then delete them — this leaves `.migrate-test` and the DB intact for the other branch. The state-file reset above is the heavier alternative

## Environments

There are three runtime environments, fully isolated from one another:

| Env         | `NODE_ENV`    | Storage class   | Database                 | ODT root                | Used by                                                                            |
| ----------- | ------------- | --------------- | ------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| Production  | `production`  | `PGStorage`     | `lessons-from-luke`      | `docs/`                 | deployed server                                                                    |
| Development | `development` | `PGDevStorage`  | `lessons-from-luke-dev`  | `docs/dev/`             | `yarn dev-web`, `yarn dev-desktop`, `yarn serve-dev`                               |
| Test        | `test`        | `PGTestStorage` | `lessons-from-luke-test` | `test/docs/serverDocs/` | `yarn test*`, `yarn test-e2e` (Cypress), `yarn test-desktop-e2e-deps` (Playwright) |

Only the test environment mounts the `/api/test/reset-storage` endpoint; in dev and production it returns 404. Dev resets through the `yarn reset:dev` CLI instead.

### One-time setup for an existing dev workstation

Existing checkouts of this repo only have the production and test DBs. To opt in to the dev environment:

1. Create the dev database: `createdb -O lessons-from-luke lessons-from-luke-dev`
2. Add a `devDb` block to `secrets.json` (delete and let it regenerate, or hand-add):
   ```json
   "devDb": {
     "database": "lessons-from-luke-dev",
     "username": "lessons-from-luke",
     "password": "lessons-from-luke"
   }
   ```
3. `yarn migrate:dev`
4. `yarn reset:dev` (loads fixtures into the dev DB; requires `dist/` built — `tsc -b ./src/server` first if needed)
5. `yarn seed-dev-docs` (copies `Luke-1-0[1-5]v03.odt` from `test/docs/serverDocs/` to `docs/dev/`)
6. `yarn dev-web`

## Architecture

### Source Structure (`src/`)

The codebase follows a four-layer architecture:

```
src/
├── core/          # Shared business logic (isomorphic - runs on server, web, and desktop)
├── server/        # Express.js API server (Node.js only)
├── frontend/      # React UI components
│   ├── common/    # Shared components between web and desktop
│   ├── web/       # Web-specific React app
│   └── desktopFrontend/  # Desktop-specific React components
└── desktop/       # Electron main process
```

### Core Layer (`src/core/`)

Platform-agnostic business logic shared across all environments:

- **models/**: Domain types and logic (Lesson, TString, Language, LessonString)
- **interfaces/**: Contracts like `Persistence` for storage abstraction
- **api/**: API client implementations
- **i18n/**: Internationalization
- **util/**: Shared utilities

Key concepts:

- **TString**: A translated string with history tracking, linked to a master ID
- **Lesson**: Organized by Book (Luke/Acts), Series, and Lesson number
- **LessonString**: Links master strings to lessons with type (content/styles/meta) and xpath
- **Language**: Has progress tracking and can be a motherTongue variant

### Server Layer (`src/server/`)

Express.js API server:

- **controllers/**: Route handlers (languages, lessons, tStrings, documents, sync, users)
- **storage/**: `PGStorage` for PostgreSQL persistence, implements `Persistence` interface
- **xml/**: ODT document processing using libxmljs2
- **usfm/**: Scripture text format handling

The server serves the web frontend in production and provides REST API endpoints under `/api/`.

### Frontend Layer (`src/frontend/`)

React 16 with Redux Toolkit for state management:

- **common/state/**: Redux store and slices
- **common/api/**: Request context for API calls
- **common/translate/**: Translation UI components
- **web/**: Web-specific pages (home, languages, lessons, documents)

Platform context (`PlatformContext`) distinguishes between "web" and "desktop" modes.

### Desktop Layer (`src/desktop/`)

Electron main process:

- **LocalStorage.ts**: Implements `Persistence` for offline-first local storage
- **DesktopApp.ts**: Electron window management
- **WebAPIClientForDesktop.ts**: API client that works offline

## Key Patterns

### TypeScript Configuration

Multiple tsconfig files for different compilation targets:

- `tsconfig.json`: Base configuration (strict mode enabled)
- `src/*/tsconfig.json`: Layer-specific settings with project references

### Storage Abstraction

The `Persistence` interface (`src/core/interfaces/Persistence.ts`) defines all data operations. Implementations:

- `PGStorage`: PostgreSQL for server
- `PGTestStorage`: In-memory PostgreSQL for tests
- `LocalStorage`: Electron local storage

### API Pattern

Controllers receive the Express app and storage instance:

```typescript
function languagesController(app: Express, storage: Persistence) {
  app.get("/api/languages", async (req, res) => { ... });
}
```

## Testing

- Jest for unit/integration tests (`*.test.ts` files alongside source)
- Cypress for E2E tests (`cypress/integration/`)
- Test files are excluded from TypeScript compilation

## Workflow & Pre-commit

### `/sp:*` feature-lifecycle workflow

The `.claude/commands/sp/` directory provides a structured feature-development pipeline:
constitution → brainstorm → specify → plan → red-team → tasks → analyze → implement → harden.
Backed by `br` (beads_rust) for task tracking. Run `/sp:00-constitution` through `/sp:08-harden`,
or `/sp:next` to advance the current feature.

**Prerequisite:** `br` (beads_rust) must be installed on `PATH` for task-tracking commands to work.
Install separately if needed.

### Pre-commit pipeline

`.husky/pre-commit` runs on every `git commit` (do **not** bypass with `--no-verify`):

1. `yarn typecheck` — full project type-check across core, server, desktop, and frontend (builds `src/core` declarations first because the other projects reference it, then runs `tsc --noEmit -p` against each)
2. `npx lint-staged` — on staged files only:
   - `*.{ts,tsx}` → `eslint --fix` → `prettier --write` → `jest --findRelatedTests --bail --passWithNoTests --runInBand`
   - `*.{js,json,md,yml,yaml}` → `prettier --write`

Helper scripts:

- `yarn lint` / `yarn lint:fix` — ESLint over the whole project
- `yarn format` / `yarn format:check` — Prettier over the whole project
- `yarn typecheck` — TypeScript project-references typecheck

## Subagents

Use subagents liberally and aggressively to conserve the main context window. Avoid performing tasks directly: instead, orchestrate subagents.

## Active Technologies

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) + better-auth `^1.6.14` (built-in password reset via `getAuth()`), (005-transactional-email-reset)
- No new tables / no migration. Reuses better-auth auth-owned `pg.Pool` tables: (005-transactional-email-reset)

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) — isomorphic four-layer architecture (`core` / `server` / `frontend` / `desktop`).
- PostgreSQL with **two isolated drivers**: domain data via porsager `postgres@1.0.2` (`PGStorage`, through the `Persistence` interface); server-only authentication via better-auth on its own `pg` (node-postgres) `Pool` (singleton exported as `getAuthPool()` from `auth.ts`). (001-better-auth-migration)
- New auth-owned `invitation` table sharing the single `getAuthPool()` singleton (server-only, constitution Principle VI exemption); Node `crypto` for token generation (randomBytes), SHA-256 hash lookup, and AES-256-GCM at-rest token encryption. (002-invitation-system)
- Web-only React route guard (`AuthGate`) in `src/frontend/web/MainRouter.tsx` (React Router v6 `Navigate`/`Outlet`/`useLocation`) over the existing better-auth `authClient` + `currentUserSlice` (`{ user, loaded }`); default-deny public allowlist + a pure `safeReturnTo` open-redirect sanitizer for `?returnTo=` deep-link return. No new persisted data, no server `/api/*` changes; desktop (`MainPage`) untouched. (003-web-auth-gate)

## Recent Changes

- 002-invitation-system: admin-issued single-use, email-bound sign-up links. New auth-owned `invitation` table on the isolated `pg.Pool`; admin endpoints under `/api/admin/invitations*` (reusing `requireAdmin`) and anonymous redemption under `/api/auth/invitation/*` (registered before the better-auth catch-all). Accept creates `user`+`account` via direct SQL with `passwordHasher.hash` (Argon2id) while `disableSignUp: true` stays global; `jestSetupAfterEnv.ts` afterEach now also `DELETE FROM "invitation"`. Web-only; desktop and the domain driver untouched.
- 001-better-auth-migration: better-auth email+password (Argon2id) replaces the plaintext hardcoded admin and `cookie-session`. Auth owns its `user`/`session`/`account`/`verification` tables through an isolated `pg.Pool` (constitution Principle VI v1.1.0 server-only exemption); the domain `postgres@1` driver is untouched. New `secrets.json` field `adminEmail`; new env var `BETTER_AUTH_URL`; `cookieSecret` must be ≥ 32 chars; new `/api/auth/*` routes; legacy `/api/users/*` removed; desktop access-code auth unchanged.
