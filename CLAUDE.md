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

## Docker Environment

A Docker container provides a Node 24 development environment with PostgreSQL. To use it:

```bash
# Build and start the container
docker compose up -d --build

# Install dependencies (use yarn, not npm — npm can cause TypeScript resolution issues)
docker compose exec claude-container bash -c "cd /workspace && yarn install"

# Run migrations against the test database
docker compose exec claude-container bash -c "cd /workspace && yarn migrate:test"

# Run tests
docker compose exec claude-container bash -c "cd /workspace && NODE_ENV=test npx jest --runInBand"

# Run tests with coverage
docker compose exec claude-container bash -c "cd /workspace && yarn test-coverage"
```

Key details:

- Node is installed via `nvm` under `/home/ubuntu/.nvm` to mirror the production deploy host (which uses `capistrano-nvm`). The version comes from `.nvmrc` (currently 24). `node`/`npm`/`yarn` are on `PATH` via `$NVM_DIR/current/bin`
- The workspace is bind-mounted at `/workspace`, so changes are shared between host and container
- `node_modules` lives in a Docker named volume (`node_modules:/workspace/node_modules` in `docker-compose.yml`) that shadows any host `node_modules`, so a host-built tree from macOS won't conflict. After rebasing the container image, run `docker compose down -v` to drop the named volume so native addons (libxmljs2, etc.) get rebuilt against the new Node
- The entrypoint starts PostgreSQL and creates three databases automatically: `lessons-from-luke` (production), `lessons-from-luke-test` (Jest/Cypress/Playwright), and `lessons-from-luke-dev` (interactive `dev-web`/`dev-desktop`)
- A `secrets.json` is auto-generated if not present, containing `db`, `testDb`, and `devDb` blocks
- Migrations target databases by env var: `TEST_DB=true` → test DB, `DEV_DB=true` → dev DB, no flag → production DB. Connection info comes from `secrets.json`
- Migration state files: `.migrate-test`, `.migrate-dev`, `.migrate-prod` (one per environment). Each persists in the workspace across container rebuilds. The legacy `.migrate` file is auto-copied to `.migrate-prod` on first run for backward compatibility
- If you rebuild the container and get `relation "languages" does not exist`, the state file thinks migrations already ran against the now-empty database. Reset with e.g. `echo '{"lastRun":null,"migrations":[]}' > .migrate-test && yarn migrate:test`
- The container runs natively on Apple Silicon (no QEMU emulation)

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

1. Create the dev database:
   - Docker: `docker compose up -d --build` (the entrypoint creates it automatically)
   - Non-Docker: `createdb -U lessons-from-luke lessons-from-luke-dev`
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

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) + Express (server), libxmljs2 (ODT XML parse/rewrite/merge), the existing `parse` / `mergeXml` / `saveDocStrings` pipeline, LibreOffice `soffice --headless` (round-trip verification). React 16 + Redux Toolkit UI (existing translation & update-issues screens, unchanged). (011-verse-reference-auto-population)

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) + Express (server), libxmljs2 (ODT XML rewrite/parse/merge), existing `parse`/`mergeXml`/`saveDocStrings` pipeline, LibreOffice `soffice --headless` (round-trip verification), React 16 + Redux Toolkit (existing translation & update-issues UI, unchanged) (011-verse-reference-auto-population)
- No new tables/columns/migrations. Domain data via the `Persistence` interface (`storage.tStrings`, `addOrFindMasterStrings`, `saveDocStrings`, `updateLesson`). Master odt files in the existing `docStorage`. (011-verse-reference-auto-population)

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) + existing 007 assembly pipeline (009-quarter-styles-template)
- No new persistent storage. Template is a \*\*static committed (009-quarter-styles-template)

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) + Express (server), existing `makeLessonFile` / `mergeXml` per-lesson pipeline, LibreOffice `soffice` headless (already a production dependency via `webifyLesson`), `child_process.exec`/`spawn`, React 16 + Redux Toolkit + styled-components (frontend), Axios + file-saver (download) (007-assembled-quarter-download)
- No new persistent storage. Domain reads go through the existing `Persistence` interface (`storage.lessons()`, `storage.lesson(id)`). Assembly job state is an **in-memory process-scoped registry** (FR-011 — explicitly non-durable). Output ODTs and constituents live in the existing `docStorage` tmp dir (24 h cleanup reused for result retention). (007-assembled-quarter-download)
- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) + better-auth `^1.6.14` (built-in password reset via `getAuth()`), (005-transactional-email-reset)
- No new tables / no migration. Reuses better-auth auth-owned `pg.Pool` tables: (005-transactional-email-reset)

- TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm) — isomorphic four-layer architecture (`core` / `server` / `frontend` / `desktop`).
- PostgreSQL with **two isolated drivers**: domain data via porsager `postgres@1.0.2` (`PGStorage`, through the `Persistence` interface); server-only authentication via better-auth on its own `pg` (node-postgres) `Pool` (singleton exported as `getAuthPool()` from `auth.ts`). (001-better-auth-migration)
- New auth-owned `invitation` table sharing the single `getAuthPool()` singleton (server-only, constitution Principle VI exemption); Node `crypto` for token generation (randomBytes), SHA-256 hash lookup, and AES-256-GCM at-rest token encryption. (002-invitation-system)

## Recent Changes

- 002-invitation-system: admin-issued single-use, email-bound sign-up links. New auth-owned `invitation` table on the isolated `pg.Pool`; admin endpoints under `/api/admin/invitations*` (reusing `requireAdmin`) and anonymous redemption under `/api/auth/invitation/*` (registered before the better-auth catch-all). Accept creates `user`+`account` via direct SQL with `passwordHasher.hash` (Argon2id) while `disableSignUp: true` stays global; `jestSetupAfterEnv.ts` afterEach now also `DELETE FROM "invitation"`. Web-only; desktop and the domain driver untouched.
- 001-better-auth-migration: better-auth email+password (Argon2id) replaces the plaintext hardcoded admin and `cookie-session`. Auth owns its `user`/`session`/`account`/`verification` tables through an isolated `pg.Pool` (constitution Principle VI v1.1.0 server-only exemption); the domain `postgres@1` driver is untouched. New `secrets.json` field `adminEmail`; new env var `BETTER_AUTH_URL`; `cookieSecret` must be ≥ 32 chars; new `/api/auth/*` routes; legacy `/api/users/*` removed; desktop access-code auth unchanged.
