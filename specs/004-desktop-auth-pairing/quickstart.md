# Quickstart: Desktop Auth Pairing + Shared-API Enforcement

**Feature**: `004-desktop-auth-pairing`. This is the manual happy-path walkthrough that the
acceptance specs and E2E suites automate.

## Prerequisites

- An invitation-based account exists (use the 002 invitation flow to create one).
- Server running with the `device-authorization` + `bearer` plugins configured in `auth.ts` and the
  `deviceCode` migration applied (`yarn migrate:dev`).
- Desktop dev: `yarn dev-web` then `yarn dev-desktop`.

## 1. Connect a desktop (US1)

1. Launch the desktop app (fresh, unpaired). It works offline from cache; while online it shows
   **"Not connected — Connect to account."**
2. Click **Connect to account**. The desktop calls `POST /api/auth/device/code`, displays a short
   code like `WDJB-MJHT` (copyable), and opens your browser to `/link?user_code=WDJB-MJHT`.
3. In the browser: sign in if prompted (existing account). The link page shows the code (pre-filled)
   and **"Connect this computer?"**. Click **Approve** → `POST /api/auth/device/approve`.
4. The desktop (polling `POST /api/auth/device/token` every ~5 s) receives `access_token`, stores it
   encrypted via `safeStorage`, and flips to **"Connected as <you>"** — then begins syncing. No
   further steps. (Decline or a 10-minute expiry instead → desktop stays unconnected and says so;
   request a fresh code to retry.)

## 2. Stay connected across restarts and offline (US3)

1. Quit and relaunch the desktop → still **Connected as <you>**, resumes syncing, no re-approval.
2. Go offline → keep editing from local cache (no errors).
3. Back online while unpaired/disconnected → clear **"Not connected"** prompt, never a silent sync
   failure.

## 3. Enforce auth on the shared API (US2)

1. Default (flag off): `curl https://<host>/api/languages` → still 200 (no change).
2. Operator sets `ENFORCE_API_AUTH=1` and restarts the server.
3. `curl https://<host>/api/languages` (anonymous) → **401**.
4. Same call with `-H "Authorization: Bearer <desktop token>"` → 200. Web app (cookie) → 200.
5. `curl https://<host>/api/auth/get-session` and the invitation/redemption links → still reachable
   anonymously.

## 4. Disconnect and admin revoke (US4)

1. Desktop **Disconnect** (online): calls `POST /api/auth/sign-out` with its Bearer token, clears
   the local credential; that token no longer works. Offline: clears locally; server-side dies via
   expiry or admin revoke.
2. Admin: in the admin area click **Revoke device access** for a user →
   `POST /api/admin/users/:userId/revoke-sessions`. That user's connected desktop is rejected (401)
   on its next online request and must re-connect. (Note: this also signs the user out of web.)

## Done when

- SC-001..SC-008 all hold; full CI green (typecheck, lint, unit, Cypress web E2E, Playwright +
  Electron desktop E2E).
