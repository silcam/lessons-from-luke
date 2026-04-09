# Lessons from Luke - Codebase Summary

## Project Overview

**Lessons from Luke** is a Sunday School curriculum translation and management application developed for SIL Cameroon. The application allows users to translate lesson content from English source documents into various languages, supporting both web and Electron desktop deployments. The desktop version enables offline-first translation work, which is critical for field translators with limited or no internet connectivity.

## Technology Stack

### Runtime & Build
- **Node.js**: Primary runtime environment
- **TypeScript**: Used throughout the codebase with strict mode enabled
- **Webpack**: Module bundling for both web and desktop targets
- **Jest**: Testing framework

### Backend
- **Express.js**: HTTP server framework
- **PostgreSQL**: Primary database (via `postgres` library)
- **libxmljs2**: XML parsing for ODT document processing
- **cookie-session**: Session management

### Frontend
- **React 16**: UI library
- **Redux Toolkit**: State management
- **React Router DOM**: Client-side routing
- **styled-components**: CSS-in-JS styling
- **Axios**: HTTP client

### Desktop
- **Electron**: Desktop application framework
- **electron-builder**: Application packaging

---

## Architecture

The codebase follows a **four-layer architecture** with clear separation of concerns:

```
src/
├── core/          # Shared isomorphic business logic
├── server/        # Express.js API server (Node.js)
├── frontend/      # React UI components
│   ├── common/    # Shared between web and desktop
│   ├── web/       # Web-specific React app
│   └── desktopFrontend/  # Desktop-specific React components
└── desktop/       # Electron main process
```

### Layer Communication

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────────────┐          ┌──────────────────────────────┐ │
│  │   Web Frontend   │          │    Desktop Frontend          │ │
│  │  (React + Redux) │          │    (React + Redux)           │ │
│  └────────┬─────────┘          └──────────────┬───────────────┘ │
│           │                                    │                 │
│           │ HTTP/Axios                         │ IPC             │
│           ▼                                    ▼                 │
└───────────┼────────────────────────────────────┼─────────────────┘
            │                                    │
┌───────────▼────────────────┐    ┌──────────────▼──────────────┐
│      Server Layer          │    │      Desktop Layer          │
│   (Express + PostgreSQL)   │    │   (Electron + LocalStorage) │
│                            │◄───│                             │
│   PGStorage implements     │    │   LocalStorage implements   │
│   Persistence interface    │    │   file-based storage        │
└───────────┬────────────────┘    └──────────────┬──────────────┘
            │                                     │
            └──────────────┬──────────────────────┘
                           │
            ┌──────────────▼──────────────────────┐
            │          Core Layer                 │
            │  (Shared models, interfaces, utils) │
            └─────────────────────────────────────┘
```

---

## Core Layer (`src/core/`)

The core layer contains platform-agnostic business logic shared across all environments.

### Domain Models (`src/core/models/`)

#### TString (Translated String)
The fundamental unit of translated content. Each string has:
- `masterId`: Unique identifier for the master string concept
- `languageId`: Target language identifier
- `text`: The translated text content
- `history`: Array of previous versions (for revision tracking)
- `source`: Optional source text used for translation
- `sourceLanguageId`: Optional source language identifier

```typescript
interface TString {
  masterId: number;
  languageId: number;
  sourceLanguageId?: number | null;
  source?: string | null;
  text: string;
  history: string[];
  lessonStringId?: number | null;
}
```

#### Language
Represents a target translation language:
- `languageId`: Unique identifier
- `name`: Display name
- `code`: Access code for the desktop app
- `motherTongue`: Boolean indicating if this is a minority/mother tongue language
- `progress`: Array of lesson-by-lesson progress percentages
- `defaultSrcLang`: Default source language for translations

The `motherTongue` flag is significant: mother tongue languages require only a subset of strings to be translated (those marked with `motherTongue: true` in LessonString).

#### Lesson
Represents a curriculum lesson organized hierarchically:
- `book`: "Luke" or "Acts"
- `series`: Series/quarter number
- `lesson`: Lesson number within series (99 = Table of Contents)
- `version`: Document version for tracking updates
- `lessonStrings`: Array of strings in the lesson

#### LessonString
Links master strings to specific lesson documents:
- `masterId`: Reference to the TString master
- `lessonId`: Parent lesson
- `type`: "content" | "styles" | "meta"
- `xpath`: Location in the source XML document
- `motherTongue`: Whether this string needs translation for mother tongue languages

#### DocString
Intermediate representation for document operations:
```typescript
interface DocString {
  type: LessonStringType;
  xpath: string;
  motherTongue: boolean;
  text: string;
}
```

#### SyncState
Manages synchronization state for the desktop app:
- `language`: Currently selected language
- `locale`: UI locale (en/fr)
- `downSync`: Package describing what needs to be downloaded
- `syncLanguages`: Language timestamps for incremental sync
- `upSync`: Dirty strings pending upload

### Interfaces (`src/core/interfaces/`)

#### Persistence Interface
Defines the contract for data storage operations, implemented by both `PGStorage` (server) and `LocalStorage` (desktop):

```typescript
interface Persistence {
  languages(): Promise<Language[]>;
  language(params): Promise<Language | null>;
  createLanguage(lang): Promise<Language>;
  updateLanguage(id, update): Promise<Language>;
  lessons(): Promise<BaseLesson[]>;
  lesson(id): Promise<Lesson | null>;
  tStrings(params): Promise<TString[]>;
  saveTStrings(tStrings, opts): Promise<TString[]>;
  sync(timestamp, languageTimestamps): Promise<ContinuousSyncPackage>;
  // ... more operations
}
```

#### API Interface
Type-safe API route definitions using TypeScript mapped types:

```typescript
interface APIGet {
  "/api/languages": [{}, PublicLanguage[]];
  "/api/languages/:languageId/lessons/:lessonId/tStrings": [
    { lessonId: number; languageId: number },
    TString[]
  ];
  // ... more routes
}
```

### Internationalization (`src/core/i18n/`)

Simple key-based i18n system supporting English and French:
```typescript
type Locale = "en" | "fr";
type TFunc = (key: I18nKey, subs?: { [key: string]: string }) => string;
```

### Utilities (`src/core/util/`)

- **arrayUtils**: `findBy`, `findIndexBy`, `uniq`, `modelListMerge`, `discriminate`
- **objectUtils**: `unset`, `objFilter`, `validateFields`
- **dateUtils**: Date formatting and manipulation
- **numberUtils**: `zeroPad`, `percent`, `average`
- **stringUtils**: String manipulation helpers
- **fsUtils**: File system operations (zip/unzip for ODT files)
- **timestampEncode**: Generate unique language codes

---

## Server Layer (`src/server/`)

The Express.js server handles API requests and manages PostgreSQL persistence.

### Entry Points

- **server.ts**: Production server bootstrap
- **serverApp.ts**: Express app configuration and middleware setup

```typescript
function serverApp(opts: { silent?: boolean } = {}) {
  const app = express();
  const storage = PRODUCTION ? new PGStorage() : new PGTestStorage();

  app.use(cookieSession({ secret: secrets.cookieSecret }));
  app.use(bodyParser.json({ limit: "2MB" }));
  app.use("/api/admin", requireUser);

  // Controllers
  usersController(app);
  languagesController(app, storage);
  lessonsController(app, storage);
  tStringsController(app, storage);
  documentsController(app, storage);
  syncController(app, storage);
  // ...
}
```

### Controllers (`src/server/controllers/`)

Controllers follow a consistent pattern, receiving the Express app and storage instance:

```typescript
function languagesController(app: Express, storage: Persistence) {
  addGetHandler(app, "/api/languages", async req => {
    return (await storage.languages()).map(lang => unset(lang, "code"));
  });
  // ... more handlers
}
```

#### Key Controllers:
- **languagesController**: CRUD for languages, USFM import
- **lessonsController**: Lesson management, document upload
- **tStringsController**: Translation string operations
- **documentsController**: Document generation and preview
- **syncController**: Continuous sync endpoint for desktop
- **usersController**: Authentication
- **migrationController**: Legacy project migration

### Storage (`src/server/storage/`)

#### PGStorage
PostgreSQL implementation of the Persistence interface:
- Uses the `postgres` library with tagged template queries
- Handles progress calculation across languages
- Supports incremental sync via timestamps

#### Database Schema

```sql
CREATE TABLE languages (
  languageId serial primary key,
  name text,
  code text,
  motherTongue boolean,
  progress jsonb,
  defaultSrcLang int,
  created bigint,
  modified bigint
);

CREATE TABLE lessons (
  lessonId serial primary key,
  book text,
  series int,
  lesson int,
  version int,
  created bigint,
  modified bigint
);

CREATE TABLE lessonStrings (
  lessonStringId serial primary key,
  masterId int,
  lessonId int,
  lessonVersion int,
  type text,
  xpath text,
  motherTongue boolean
);

CREATE TABLE tStrings (
  masterId serial,
  languageId int,
  sourceLanguageId int,
  source text,
  text text,
  history jsonb,
  lessonStringId int,
  created bigint,
  modified bigint
);
```

### XML Processing (`src/server/xml/`)

#### parse.ts
Extracts translatable strings from ODT content.xml:
- Uses XPath to find paragraphs with specific styles
- Identifies mother tongue strings via style patterns (e.g., "Langue_20_Maternelle")
- Returns DocString arrays with xpath locations

#### mergeXml.ts
Merges translations back into ODT documents:
- Unzips ODT (which is a ZIP of XML files)
- Updates content.xml, styles.xml, and meta.xml
- Re-zips into valid ODT

### USFM Processing (`src/server/usfm/`)

Handles USFM (Unified Standard Format Markers) scripture format:
- **importUsfm.ts**: Imports scripture translations
- **translateFromUsfm.ts**: Matches USFM verses to existing English strings

### Actions (`src/server/actions/`)

Business logic operations:
- **uploadDocument.ts**: Process ODT file uploads
- **makeLessonFile.ts**: Generate translated ODT documents
- **webifyLesson.ts**: Generate HTML previews
- **defaultTranslations.ts**: Copy translations from source language
- **findTSubs.ts**: Find translation substitutions for updates

---

## Frontend Layer (`src/frontend/`)

React-based UI with Redux Toolkit for state management.

### Application Entry Points

#### webApp.tsx (Web)
```typescript
function WebApp() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <PlatformContext.Provider value="web">
          <RequestContext.Provider value={{ get: webGet, post: webPost }}>
            <MainRouter />
          </RequestContext.Provider>
        </PlatformContext.Provider>
      </BrowserRouter>
    </Provider>
  );
}
```

#### desktopApp.tsx (Desktop)
```typescript
<Provider store={store}>
  <PlatformContext.Provider value="desktop">
    <RequestContext.Provider value={{ get: ipcGet, post: ipcPost }}>
      <MainPage />
    </RequestContext.Provider>
  </PlatformContext.Provider>
</Provider>
```

### Platform Abstraction

The `PlatformContext` distinguishes between "web" and "desktop" modes, allowing shared components to conditionally render platform-specific UI.

The `RequestContext` provides platform-appropriate API clients:
- Web: Uses Axios HTTP client
- Desktop: Uses IPC for communication with the Electron main process

### State Management (`src/frontend/common/state/`)

Redux store configuration with multiple slices:

```typescript
const reducer = combineReducers({
  languages: languageSlice.reducer,
  tStrings: tStringSlice.reducer,
  tSubs: tSubSlice.reducer,
  currentUser: currentUserSlice.reducer,
  banners: bannerSlice.reducer,
  loading: loadingSlice.reducer,
  lessons: lessonSlice.reducer,
  docStrings: docStringSlice.reducer,
  network: networkSlice.reducer,
  docPreview: docPreviewSlice.reducer,
  syncState: syncStateSlice.reducer
});
```

### Key Components

#### Translation UI (`src/frontend/common/translate/`)
- **TranslateHome**: Main translation landing page
- **TranslateLesson**: Translation interface for a specific lesson
- **TranslateWithPreview**: Side-by-side translation with document preview
- **TranslateFallback**: Translation without preview (when unavailable)
- **TStringInput**: Individual string translation input
- **TStringHistoryView**: Shows translation history

#### Web-Specific (`src/frontend/web/`)
- **MainRouter**: React Router configuration
- **LanguageView**: Language detail and progress
- **LessonPage**: Lesson detail with strings
- **MigrateProject**: Legacy project migration UI
- **UploadLessonForm**: Document upload interface

#### Desktop-Specific (`src/frontend/desktopFrontend/`)
- **MainPage**: Desktop main interface
- **SplashScreen**: Loading screen
- **DownSyncPage**: Sync progress display
- **SyncCodeForm**: Language code entry

### API Hooks

Custom hooks for data loading:
- **useLoad**: Generic data loading with loading state
- **useLessonTStrings**: Load lesson with translations
- **useLanguageLessons**: Load lessons for a language

---

## Desktop Layer (`src/desktop/`)

Electron application for offline-first translation.

### Main Process

#### DesktopApp.ts
Main Electron application class:
- Manages BrowserWindow lifecycle
- Initializes LocalStorage and WebAPIClient
- Sets up IPC communication
- Handles menu configuration
- Triggers background sync operations

```typescript
class DesktopApp {
  localStorage: LocalStorage;
  webClient: WebAPIClientForDesktop;
  mainWindow: BrowserWindow | null = null;

  constructor(localStorage: LocalStorage = new LocalStorage()) {
    this.localStorage = localStorage;
    this.webClient = new WebAPIClientForDesktop(localStorage);
    this.init();
  }

  private init() {
    app.on("ready", () => this.appReady());
  }
}
```

### LocalStorage (`src/desktop/LocalStorage.ts`)

File-based storage implementing local persistence:
- Stores data as JSON files in Electron's userData directory
- Memory store (`memoryStore.json`): languages, lessons, sync state
- Per-lesson files: `lessonStrings_${id}.json`
- Per-language files: `tStrings_${languageId}.json`
- HTML previews: `docPreview_${lessonId}.html`

```typescript
interface MemoryStore {
  syncState: StoredSyncState;
  languages: PublicLanguage[];
  lessons: BaseLesson[];
  localStorageVersion: number;
}
```

Features:
- Atomic writes (write to temp file, then rename)
- Automatic progress recalculation
- Data usage logging
- Storage version migration

### Synchronization (`src/desktop/controllers/downSync.ts`)

The desktop app implements continuous synchronization:

1. **Check for updates**: Query server with current timestamps
2. **Sync languages**: Download language list if changed
3. **Sync base lessons**: Download lesson metadata if changed
4. **Sync lesson strings**: Download full lesson content
5. **Sync tStrings**: Download translations in batches
6. **Fetch previews**: Download HTML document previews

```typescript
async function downSync(app: DesktopApp) {
  await getDownSync(app);

  const langSyncPromise = syncLanguages(app);
  const baseLessonSyncPromise = syncBaseLessons(app);
  const lessonSyncPromise = syncLessons(app);
  const tStringSyncPromise = syncTStrings(app);

  await Promise.all([...]);
}
```

### IPC Communication

Desktop frontend communicates with main process via IPC:
- **DesktopAPIServer**: Handles IPC requests in main process
- **desktopAPIClient**: Wraps IPC calls in renderer process

```typescript
// Frontend (renderer)
export async function ipcGet<T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
): Promise<APIGet[T][1] | null> {
  return ipcRenderer.invoke(GET, { route, params });
}

// Main process
ipcMain.handle(GET, async (event, { route, params }) => {
  // Handle request using LocalStorage
});
```

---

## Key Patterns

### Storage Abstraction
The `Persistence` interface allows the same business logic to work with both PostgreSQL (server) and file-based (desktop) storage.

### Platform Context
React Context (`PlatformContext`) enables shared components to adapt behavior based on platform.

### Request Context
React Context (`RequestContext`) provides platform-appropriate API clients, allowing the same components to work in both web and desktop environments.

### Translation History
Every TString maintains a history array, enabling users to see and potentially revert to previous translations.

### Mother Tongue Support
The system distinguishes between full translations and "mother tongue" translations, which only require a subset of strings to be translated.

### Incremental Sync
The desktop app uses timestamp-based incremental sync to minimize data transfer and support offline work.

### ODT Processing
Documents are processed by:
1. Unzipping ODT files (which are ZIP archives)
2. Parsing XML to extract translatable strings with XPath locations
3. Merging translations back using the same XPath locations
4. Re-zipping into valid ODT

---

## Testing

### Test Infrastructure
- Jest as the test framework
- `PGTestStorage`: Test database wrapper with fixture loading
- Cypress for E2E tests
- Spectron for Electron app testing

### Test Files
Test files are co-located with source files (`*.test.ts`):
- `src/server/storage/storage.test.ts`
- `src/server/xml/parse.test.ts`
- `src/server/controllers/*.test.ts`
- `src/core/util/*.test.ts`

---

## Build & Deployment

### Development
```bash
yarn dev-web      # Web development server
yarn dev-desktop  # Electron development (requires dev-web)
```

### Production
```bash
yarn build-server   # Build web production bundle
yarn build-desktop  # Build Electron app
yarn deploy         # Capistrano deploy
```

### Docker
Docker configuration available for containerized development/deployment.

---

## Configuration Files

- **tsconfig.json**: TypeScript configuration with project references
- **webpack/**: Separate webpack configs for web and desktop builds
- **jest.config.js**: Jest configuration
- **secrets.json**: Database credentials (not in version control)
- **.nvmrc**: Node version specification

---

## Data Flow Examples

### Translation Save (Web)
1. User edits text in `TStringInput` component
2. Component dispatches Redux action with debounce
3. `tStringSlice` updates store and calls API
4. `tStringsController` receives request
5. `PGStorage.saveTStrings()` updates database
6. History is appended to existing TString
7. Progress recalculated for all languages

### Translation Save (Desktop)
1. User edits text in `TStringInput` component
2. Component dispatches Redux action
3. Action calls `ipcPost` instead of HTTP
4. `DesktopAPIServer` handles IPC message
5. `LocalStorage.setProjectLanguageTStrings()` updates local file
6. Changes queued in `upSync.dirtyTStrings` for server sync
7. Next sync uploads changes to server

### Document Upload
1. Admin uploads ODT via `UploadLessonForm`
2. `documentsController` receives multipart form data
3. ODT unzipped, XML parsed to extract DocStrings
4. Master strings created/found via `addOrFindMasterStrings`
5. LessonStrings created linking master IDs to XPath locations
6. HTML preview generated via `webifyLesson`
7. Progress recalculated for all languages

---

## Known Considerations

### Node Version
The project requires Node.js 12 for compatibility with `libxmljs2` native module compilation. Development on Apple Silicon requires running in x86_64 emulation mode.

### Special Language IDs
- `ENGLISH_ID = 1`: Master/source language
- `FRENCH_ID = 2`: Primary translation language

### TOC Lesson
Lesson number 99 (`TOC_LESSON`) represents Table of Contents documents.
