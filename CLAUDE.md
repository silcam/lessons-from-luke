# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lessons from Luke is a Sunday School curriculum translation and management application. It supports both web and Electron desktop deployments, allowing users to translate lesson content from English source languages into other languages.

## Development Commands

```bash
# When running on macOS Apple silicon, all commands must be run in x86_64 compatibility mode:
arch -x86_64 zsh

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
- **web/**: Web-specific pages (home, languages, lessons, documents, migrate)

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
