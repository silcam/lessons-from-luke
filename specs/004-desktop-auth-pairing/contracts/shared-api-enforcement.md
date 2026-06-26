# Contract: Shared-API Authentication Enforcement

**Feature**: `004-desktop-auth-pairing` | FR-009..FR-012, SC-003/SC-004/SC-007

This is a behavioral contract (not a new endpoint): how the existing domain `/api/*` routes behave
under the `ENFORCE_API_AUTH` flag. Implemented by a `requireUserWhenEnforced` wrapper mounted ahead
of the domain controllers in `serverApp.ts`. Authentication is resolved by the existing
`loadSession`/`requireUser`, which — with the `bearer` plugin installed — accepts **both** a web
session cookie **and** an `Authorization: Bearer <session-token>` from the desktop.

## Gated routes (require an authenticated user when the flag is ON)

- `GET  /api/languages`
- `GET  /api/languages/code/:code`
- `GET  /api/languages/:languageId/lessons/:lessonId/tStrings`
- `GET  /api/languages/:languageId/tStrings`
- `GET  /api/languages/:languageId/tStrings/:ids`
- `GET  /api/lessons`
- `GET  /api/lessons/:lessonId`
- `GET  /api/lessons/:lessonId/webified`
- `GET  /api/sync/:timestamp/languages/:languageTimestamps?`
- `POST /api/tStrings`

(`/api/admin/*` is already gated by `requireAdmin` and is unaffected.)

## Always-public routes (never gated — pre-login surface, FR-011)

- `POST /api/auth/sign-in/email`, `GET /api/auth/get-session`, and all other `/api/auth/*`
- `POST /api/auth/device/code | approve | deny | token` (device pairing)
- `GET  /api/auth/invitation/:token`, `POST /api/auth/invitation/accept`

## Behavior matrix

| Flag | Caller | Expected |
| --- | --- | --- |
| OFF (default) | anyone (incl. anonymous) | unchanged — request served as today (FR-012, SC-004) |
| OFF | desktop with Bearer / web with cookie | served; credential accepted but not required (FR-012) |
| ON | anonymous (no cookie, no Bearer) | **401 `{ "error": "Unauthorized" }`** (FR-010, SC-003) |
| ON | web user with valid session cookie | served (FR-010, SC-003) |
| ON | desktop with valid Bearer session token | served (FR-010, SC-003) |
| ON | desktop with revoked/expired Bearer | 401 → desktop drops to "not connected, reconnect" |
| ON (any) | sign-in / invitation / device-pairing routes | served without auth (FR-011, SC-007) |

## Contract tests to generate (Phase: tasks)

1. Flag OFF: anonymous `GET /api/languages` → 200 (no regression).
2. Flag ON: anonymous `GET /api/languages` → 401.
3. Flag ON: `GET /api/languages` with a valid cookie → 200.
4. Flag ON: `GET /api/languages` with `Authorization: Bearer <session token>` → 200.
5. Flag ON: `POST /api/tStrings` anonymous → 401; with Bearer → 200.
6. Flag ON: `/api/auth/get-session`, `/api/auth/invitation/:token`, `/api/auth/device/code`
   reachable anonymously (FR-011).
7. Flag ON: a Bearer token whose session was revoked (admin) → 401 (FR-017, SC-005).
8. **FR-011 guard**: assert no gated route is referenced by the web app's pre-login (public-allowlist)
   screens — a static check over the AuthGate public allowlist + the redemption/sign-in pages.
