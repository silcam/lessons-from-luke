# Quickstart: Language Project Rename

Feature: `016-language-rename` | Date: 2026-07-31

## Prerequisites

Standard local setup (see CLAUDE.md). No migration is required for this feature — the `languages`
table is unchanged.

```bash
nvm use                # Node 24 per .nvmrc
yarn install
yarn migrate:dev       # only if your dev DB is behind; this feature adds no migration
yarn reset:dev         # fixtures, if the dev DB is empty
```

## Exercise the feature manually

```bash
yarn dev-web
```

1. Sign in as the admin (credentials from `secrets.json` / the seeded admin user).
2. Open the **Languages** box and click a language — you land on `/languages/:languageId`
   (`LanguageView`).
3. Beside the language-name heading, click **Edit**. The heading is replaced by a text input
   pre-filled with the current name, plus **Save** and **Cancel**.
4. **Cancel** → the heading returns unchanged and nothing is posted.
5. Type a new name and **Save** → the heading and the Languages list both show the new name with no
   page reload. Reload to confirm persistence.
6. Try `"   "` (whitespace only) → inline "name required" feedback; the editor stays open.
7. Try another existing language's name, in any casing → inline duplicate feedback; the editor stays
   open; the original name is untouched.
8. Try `"  New Name  "` → saves as `New Name` (trimmed).

## Verify the API directly

```bash
# Successful rename (session cookie required — copy one from the browser)
curl -i -X POST http://localhost:3000/api/admin/languages/2 \
  -H 'Content-Type: application/json' -b "$COOKIE" \
  -d '{"name":"  Français  "}'
# → 200, body.name === "Français"

# Empty name
curl -i -X POST http://localhost:3000/api/admin/languages/2 \
  -H 'Content-Type: application/json' -b "$COOKIE" -d '{"name":"   "}'
# → 422

# Duplicate of another active language
curl -i -X POST http://localhost:3000/api/admin/languages/2 \
  -H 'Content-Type: application/json' -b "$COOKIE" -d '{"name":"english"}'
# → 409

# Own current name (no-op)
curl -i -X POST http://localhost:3000/api/admin/languages/2 \
  -H 'Content-Type: application/json' -b "$COOKIE" -d '{"name":"Français"}'
# → 200

# Archived target — 404 wins over 409 even if the name collides
curl -i -X POST http://localhost:3000/api/admin/languages/<archivedId> \
  -H 'Content-Type: application/json' -b "$COOKIE" -d '{"name":"english"}'
# → 404
```

## Run the tests

```bash
# Unit / integration (needs local Postgres on the Unix socket; run outside a sandbox)
NODE_ENV=test npx jest src/server/controllers/languagesController.test.ts --runInBand
NODE_ENV=test npx jest src/frontend/web/languages/LanguageView.test.tsx --runInBand

# E2E
yarn test-e2e            # includes cypress/integration/language-rename.US15.spec.ts
```

## Files this feature touches

| File                                               | Change                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/core/interfaces/Api.ts`                       | `name?: string` on the update endpoint's request body  |
| `src/core/i18n/locales/en.ts`                      | `Language_name_duplicate`, `Language_name_required`    |
| `src/server/controllers/languagesController.ts`    | whitelist `name`; guard/trim/empty(422)/404-before-409 |
| `src/frontend/common/state/languageSlice.ts`       | `pushLanguageRename` thunk                             |
| `src/frontend/web/languages/LanguageView.tsx`      | Edit link → inline editor + inline error feedback      |
| `cypress/integration/language-rename.US15.spec.ts` | new E2E spec                                           |
| `migrations/`                                      | **unchanged — no migration**                           |
