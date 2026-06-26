# Implementation Plan: Desktop App Authentication (Code-Based Pairing) + Shared-API Enforcement

**Branch**: `004-desktop-auth-pairing` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-desktop-auth-pairing/spec.md`

## Summary

Give the Electron desktop its own server credential via an RFC 8628 device-grant (the user clicks
**Connect to account**, the desktop shows a short code and opens the browser, the user signs in and
approves, and the desktop — polling — becomes connected as them), then **require authentication on
the shared domain `/api/*` routes behind a default-off server flag** so anonymous callers are locked
out once the connect-capable desktop ships.

**Technical approach** (from Phase 0 research): adopt the better-auth **`device-authorization`** +
**`bearer`** plugins (both already in `better-auth@^1.6.14`). They provide the entire pairing
protocol and a credential that **is a better-auth session token**, presented as
`Authorization: Bearer <token>`. Because the `bearer` plugin makes `getSession` accept that header,
the existing `loadSession`/`requireUser` already authenticates **both** the web cookie and the
desktop bearer — so the "unified gate" is a thin flag-conditional wrapper, credential renewal is
better-auth's sliding session expiry, self-disconnect is `sign-out`, and admin revoke-by-user is a
one-line SQL delete of the user's sessions. Net-new code is small and mostly wiring + UI.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
**Primary Dependencies**: better-auth `^1.6.14` (NEW: enable its `device-authorization` + `bearer`
plugins — no new packages), `pg` (auth pool), Express, React 16 + styled-components, Electron
`^41.2.0` (NEW use of `safeStorage`, existing `shell.openExternal`), Axios.
**Storage**: Auth pool (`getAuthPool()`) — NEW `deviceCode` table (plugin schema), reuses existing
`session` table for the credential. Desktop-local encrypted credential blob via `safeStorage` under
the `LocalStorage` base path. **No domain-data / `Persistence` change.**
**Testing**: Jest (unit, TDD), `*.integration.test.ts` for the server auth flow, Cypress (web E2E
for the link/approval page + enforcement), Playwright + Electron (desktop E2E for connect/disconnect
/offline).
**Target Platform**: Web (Express + Passenger behind Cloudflare) and Desktop (Electron, macOS/Windows).
**Project Type**: Isomorphic four-layer (`core` / `server` / `frontend` / `desktop`).
**Performance Goals**: Connect end-to-end < 2 min, single code (SC-001); revoke effective within one
poll/sync cycle (SC-005); poll interval 5 s with `slow_down` backoff.
**Constraints** (carried from research + brainstorm Key Decisions): outbound-HTTPS only — **no
loopback server, no custom URL scheme**; desktop credential is bearer-style/non-cookie (CSRF-safe
from the Electron main process); server-only auth code MUST NOT enter `core` or the desktop offline
path (FR-018, Principle VI); offline-first preserved (FR-014); no third-party OAuth, no public
sign-up (FR-019); language-code selection unchanged (FR-020); enforcement default-OFF (FR-009).
**Scale/Scope**: Small internal user base; a user may pair multiple devices; one new admin endpoint,
one new web page, desktop connect/disconnect UI, one migration, plugin config, one gate wrapper.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-25-desktop-app-authentication-requirements.md](../brainstorms/2026-06-25-desktop-app-authentication-requirements.md)

### Key Decisions Carried Forward

- **Pair AND enforce in one feature**: the desktop credential is what lets the server honestly
  require auth → both ship together (US1 + US2).
- **Authentication only in v1**: prove a real account is behind each request; per-language
  authorization deferred (explicit non-goal below).
- **Code-based device grant, loopback/URL-scheme explicitly rejected**: only outbound HTTPS — drove
  the choice of the `device-authorization` plugin (research R1).
- **Bearer-style, non-cookie, CSRF-safe credential**, reusing the invitation at-rest pattern as
  precedent → realized as a better-auth session token + `safeStorage` (research R2, R5).
- **Revocable, minimal lifecycle surface**: Disconnect + admin revoke, no device-list UI
  (research R8; non-goal below).

### Deferred Questions (resolved during planning)

- Code format / expiry / poll interval / auto-open → research **R4** (`XXXX-XXXX`, 10 min, 5 s,
  auto-open + visible code).
- Credential lifetime & renewal, at-rest storage → **R3** (60-day sliding session) + **R5**
  (`safeStorage`).
- Plugin vs bespoke → **R1** (plugin).
- Unified gate accepting cookie + bearer, CSRF interaction → **R2/R6**.
- Exact gated `/api/*` set + no pre-login domain call → **R7**.
- Admin revoke-by-user surface → **R8**.
- Enforcement rollout / version skew → **R9/R10** (default-off flag is the rollout lever).

## Constitution Check

_GATE: re-checked after Phase 1 design — still PASS._

| Principle | Status | Notes |
| --- | --- | --- |
| **I. Test-First (TDD)** | PASS | Unit TDD for the gate wrapper, revoke store fn, desktop credential store, header injection, and connection-state logic; integration test for the pairing/enforcement flow; Cypress (link page + enforcement) and Playwright+Electron (connect/disconnect/offline) for the user-facing flows (Principle I doc-processing/E2E clause). |
| **II. Type Safety** | PASS | Strict TS, explicit return types, no `any` (mirror the cast-with-comment pattern already used for better-auth handler types), `type` imports. |
| **III. Code Quality** | PASS | JSDoc on new public fns; reuse `requireUser`, `requireSameOrigin`, `invitationStore` direct-SQL patterns; import ordering/Prettier. |
| **IV. Pre-commit Gates** | PASS | `yarn typecheck` + lint-staged + conventional commits; no `--no-verify`. |
| **V. Warnings** | PASS | Zero-warning; address any better-auth plugin deprecation immediately. |
| **VI. Layered Architecture / Dual Targets** | PASS | All auth data on the server-only auth pool (exemption); the desktop obtains/uses the credential **over HTTP only** and never imports better-auth (FR-018); `core` stays isomorphic — header passing added as an opaque-string param, no credential logic in `core`; offline-first preserved; the three runtime envs keep their isolation (the new flag is env-scoped, default off). |
| **VII. Simplicity** | PASS | The headline simplification: reuse the plugin + session-as-credential instead of bespoke crypto and a parallel credential table (YAGNI/DRY/KISS). One new endpoint, one table, one gate wrapper. |

**No violations** → Complexity Tracking section omitted.

## Project Structure

### Documentation (this feature)

```text
specs/004-desktop-auth-pairing/
├── plan.md                      # This file
├── research.md                  # Phase 0 — R1..R10 decisions
├── data-model.md                # Phase 1 — entities & migration
├── quickstart.md                # Phase 1 — manual walkthrough
├── contracts/
│   ├── device-pairing-api.yaml      # /api/auth/device/* (plugin) + sign-out
│   ├── admin-revoke-api.yaml        # POST /api/admin/users/:userId/revoke-sessions
│   └── shared-api-enforcement.md    # flag behavior over the domain routes
└── tasks.md                     # Phase 2 — created by sp:05-tasks (NOT here)
```

### Source Code (repository root)

```text
src/
├── server/
│   ├── auth/
│   │   ├── auth.ts                       # MODIFY: add deviceAuthorization() + bearer() plugins,
│   │   │                                 #         session{expiresIn:60d,updateAge:1d}, userCode gen
│   │   └── sessionRevocation.ts          # NEW: revokeUserSessions(pool, userId) — direct SQL
│   ├── middle/
│   │   └── requireUserWhenEnforced.ts    # NEW: flag-conditional wrapper around requireUser
│   ├── util/
│   │   └── enforcementFlag.ts            # NEW: typed ENFORCE_API_AUTH accessor (default off)
│   ├── controllers/
│   │   └── adminUsersController.ts       # NEW: POST /api/admin/users/:userId/revoke-sessions
│   └── serverApp.ts                      # MODIFY: mount requireUserWhenEnforced on domain routes;
│                                         #         register adminUsersController
├── core/
│   └── api/
│       └── WebAPIClient.ts               # MODIFY: optional opaque `headers` param on webGet/webPost
├── desktop/
│   ├── auth/
│   │   ├── DevicePairing.ts              # NEW: code request, browser open, poll loop, token capture
│   │   └── CredentialStore.ts            # NEW: safeStorage encrypt/decrypt of the bearer token
│   ├── WebAPIClientForDesktop.ts         # MODIFY: inject Authorization: Bearer; 401 → drop paired
│   └── DesktopApp.ts                      # MODIFY: wire pairing/disconnect, paired-state IPC
└── frontend/
    ├── web/
    │   └── deviceLink/
    │       ├── DeviceLinkPage.tsx        # NEW: enter/confirm code + Approve/Decline (authed route)
    │       └── deviceLinkThunks.ts       # NEW: calls /api/auth/device/approve|deny
    ├── web/MainRouter.tsx                # MODIFY: add /link as an authenticated (gated) route
    ├── web/home/AdminHome.tsx            # MODIFY: "Revoke device access" control
    └── desktopFrontend/
        ├── ConnectAccount.tsx            # NEW: Connect/Connected/Disconnect + code display
        └── downSync/DownSyncPage.tsx     # MODIFY: surface not-connected/connect prompt

migrations/
└── <ts>-AddDeviceCodeTable.js           # NEW: deviceCode table on the auth pool (plugin schema)
```

**Structure Decision**: Standard isomorphic four-layer layout. Server auth lives under
`src/server/auth/`; the desktop's credential handling is a new `src/desktop/auth/` folder that talks
to the server **only over HTTP** (Principle VI); the web link page is a new authenticated route in
the existing web SPA; `core` changes are limited to an opaque header pass-through.

## Presentation Design

**Component Framework**: React 16 + styled-components, using the existing
`src/frontend/common/base-components/` kit and `Colors.ts` / Helvetica scale per `DESIGN.md`
(consistency over novelty — the invitation screens are explicitly _not_ the reference).
**Interaction Patterns**: Redux Toolkit + thunks (web); desktop uses the IPC + `useLoad`/`usePush`
pattern already in `desktopFrontend`; web routing via React Router v6 inside the 003 `AuthGate`.
**Accessibility Target**: WCAG 2.2 AA (readable copyable code, keyboard-operable approve/decline,
clear status/error text per `PRODUCT.md`).

### UI Decisions

| Screen / Component | User Story | Approach | Design Skills |
| --- | --- | --- | --- |
| Desktop **Connect to account** (idle + code display + "Connected as <user>" + Disconnect) | US1, US4 | New `ConnectAccount.tsx` from base-components; shows copyable `XXXX-XXXX` code, auto-opens browser, polls; Disconnect button | `/design-language-to-daisyui` (map to base-components), `/design-clarify` (status + error copy) |
| Desktop **not-connected / connect prompt** in DownSync | US3 | Modify `DownSyncPage` empty/disconnected state | `/design-onboard` (first-run / empty state), `/design-clarify` |
| Web **Device link / approval page** (`/link`): enter/confirm code, Approve / Decline | US1 | New authenticated React route + thunks; pre-fills `?user_code`; requires sign-in (AuthGate) | `/design-language-to-daisyui`, `/design-clarify`, `/design-adapt` (small windows) |
| Web admin **Revoke device access** control | US4 | Button in `AdminHome` user/invitation area + confirm | `/design-clarify` (destructive-action copy) |

### Quality Pass

**Design quality target**: Production (internal field tool — clarity/robustness over flourish).
**Post-implementation refinement**: `/design-audit` (consistency vs. `DESIGN.md`), `/design-clarify`
(microcopy for the four desktop states + expiry/decline messages).

## Acceptance Test Strategy

> **ATDD Outer Loop**: `sp:05-tasks` creates these GWT files before the `US<N>` tasks run.
> Acceptance-spec numbering continues the global sequence (001/002 used US01–US08, 003 used
> US09–US10), so this feature is **US11–US14**, mapping to the spec's local US1–US4.

| User Story (local) | Acceptance Spec File | Scenarios |
| --- | --- | --- |
| US1 — Connect a desktop (P1) | `specs/acceptance-specs/US11-desktop-connect-pairing.txt` | 5 |
| US2 — Lock down the shared API (P2) | `specs/acceptance-specs/US12-shared-api-enforcement.txt` | 4 |
| US3 — Stay connected / offline (P2) | `specs/acceptance-specs/US13-stay-connected-offline.txt` | 3 |
| US4 — Disconnect & admin revoke (P3) | `specs/acceptance-specs/US14-disconnect-and-revoke.txt` | 3 |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Phase 0 — Outline & Research

Complete. All "Deferred to Planning" items resolved in [research.md](./research.md) (R1–R10). No
remaining NEEDS CLARIFICATION. Two non-blocking implementation spikes are flagged: (a) confirm
`updateAge` sliding renewal triggers on plain authenticated GETs (R3); (b) confirm Origin-less
`/device/code` and `/device/token` are not 403'd under `BETTER_AUTH_ENFORCE_ORIGIN=1` (R6).

## Phase 1 — Design & Contracts

Complete: [data-model.md](./data-model.md), three files under [contracts/](./contracts/),
[quickstart.md](./quickstart.md). Agent context refreshed via
`.specify/scripts/bash/update-agent-context.sh claude`.

**Post-design constitution re-check**: PASS (table above) — the design _reduces_ surface area
(plugin reuse, session-as-credential) rather than adding complexity; no new violations.
