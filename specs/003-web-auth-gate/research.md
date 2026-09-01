# Phase 0 Research: Require Authentication on Web Content Routes

This document resolves the "Deferred to Planning" items from the spec and brainstorm into
concrete technical decisions. There were no `NEEDS CLARIFICATION` markers in the Technical
Context; every open item below traces to a brainstorm "Deferred to Planning" entry or a spec
Assumption.

Alternatives the brainstorm already rejected (do NOT re-explore): server-side `/api/*` gating,
per-translation authorization, desktop authentication, a new sign-in UI, and public self-service
sign-up. See brainstorm "Scope Boundaries".

---

## R1. Avoiding redirect flicker during initial session load (FR-010, SC-006)

**Decision**: `AuthGate` reads `currentUserSlice.loaded`. While `loaded === false` it renders
the existing `LoadingSnake` and makes **no** redirect decision. Only once `loaded === true` does
it evaluate `user !== null`. `loadCurrentUser()` is already dispatched on mount in `MainRouter`'s
`useEffect`, which sets `loaded` true via `setUser` (for both the user and the null case).

**Rationale**: The session-load completion flag already exists in Redux; the guard consults that
single source of truth rather than introducing a new one (spec Assumption). Gating the decision
on `loaded` guarantees an already-authenticated user reloading a deep link is never bounced to
sign-in (SC-006: zero false redirects). `MainRouter` already shows `LoadingSnake` while
`!loaded`, so reusing it keeps behavior consistent and adds no new loading affordance.

**Alternatives considered**:

- _Optimistically render and redirect once `loaded` resolves_ — rejected: causes exactly the
  flicker/false-redirect FR-010 forbids.
- _A separate `authStatus: "pending" | "in" | "out"` machine_ — rejected (YAGNI): the existing
  `{ user, loaded }` shape already encodes the three states; adding a parallel enum risks drift.

**Strict-TS note**: use `loaded === false` / `user !== null`, never truthy checks
(constitution II strict-boolean-expressions).

---

## R2. Preserving and restoring the intended destination across sign-in (FR-006, FR-008)

**Decision**: When the guard redirects an unauthenticated visitor, it encodes the originally
requested in-app path + search (e.g. `/translate/6YI9AHY`) into a **`returnTo` query parameter**
on the sign-in URL: `/?returnTo=%2Ftranslate%2F6YI9AHY`. The value is produced from
`useLocation()` (`location.pathname + location.search`) and URL-encoded. On successful sign-in,
the post-login navigation reads `returnTo`, runs it through `safeReturnTo()`, and
`navigate(sanitized)`; if absent or rejected it falls back to `"/"` (home).

**`safeReturnTo(raw: string | null): string`** — a pure, exhaustively unit-tested sanitizer that
returns a safe in-app path or `"/"`:

- accept only values that start with a single `/` followed by a non-`/` character (a same-app
  absolute path), preserving query string;
- reject `null`/empty, protocol-relative (`//host`, `/\host`), absolute URLs
  (`http://`, `https://`, `javascript:`, any scheme), and anything containing a host;
- decode safely and re-validate; never return an external destination.
  This is the FR-008 open-redirect guard, isolated as a single testable policy function
  (prefactoring: separate policy from mechanism; design for testability).

**Rationale**: A query param (vs. React Router location-state) **survives a full page reload**,
which is essential because the sign-in page is `PublicHome` rendered at the app root and the deep
link may be opened cold in a fresh tab. It is also inspectable and easy to assert in Cypress.
The existing `pushLogin` thunk hard-codes `callbackURL: "/"` for the better-auth email sign-in;
that `callbackURL` is a server-redirect hint that the in-place email flow does not actually
navigate with — the React layer performs the navigation after `setUser`. So return-to is handled
in the React/thunk layer, not via better-auth's `callbackURL`.

**Alternatives considered**:

- _React Router `location.state` (`<Navigate state={{ from }}/>`)_ — rejected: lost on hard
  reload / cold deep-link open; harder to verify in E2E.
- _`sessionStorage`_ — rejected: extra implicit state, multi-tab bleed, no benefit over the URL.
- _Trusting `returnTo` verbatim_ — rejected: classic open-redirect (FR-008); hence
  `safeReturnTo`.

**Where the navigation fires**: simplest correct placement is in the sign-in success path. Two
acceptable implementations (decide in `sp:05-tasks`/implementation, both TDD-able):

1. `PublicHome` reads `returnTo` from `useSearchParams()` and, after a successful
   `pushLogin`, calls `navigate(safeReturnTo(returnTo))`; or
2. `pushLogin` accepts an optional `onSuccess(destination)` / returns a result the component
   navigates with.
   Option 1 keeps navigation in the component (where `useNavigate` lives) and the thunk pure of
   routing — preferred. Either way `safeReturnTo` is the single chokepoint.

---

## R3. Logout / mid-session expiry handling (FR-009/FR-011, edge cases)

**Decision**: **Next-navigation only.** No API 401 interceptor and no active live ejection in
this feature. On sign-out, the existing `pushLogout` clears `user`; the guard then redirects on
the next navigation/render. A session that expires while a gated page is open is not actively
ejected — the data API stays open in this feature — but the next navigation or reload routes
through `AuthGate`, which redirects to sign-in (spec edge case "Session expires while viewing").
Signing out from a gated page leaves the user on the sign-in page (FR-011), because clearing
`user` makes the current gated route fail the guard on re-render.

**Rationale**: Matches the brainstorm's leaning ("next navigation only ... since the API stays
open") and FR-013 (no API changes). An interceptor would imply the API can distinguish/deny
sessions, which is explicitly future work (desktop credential). YAGNI.

**Verification of FR-011 on sign-out**: `pushLogout` currently calls
`setUser(null)` after `signOut()`. Confirm the post-logout render lands on sign-in: because
`logout`/`setUser(null)` keeps `loaded === true` with `user === null`, the guard immediately
redirects the (now-gated) current route to sign-in. (Implementation note: ensure logout does not
leave the user on a still-mounted gated component without re-evaluating the guard — a normal
re-render through `AuthGate` satisfies this.)

---

## R4. Standard (non-admin) signed-in home (FR-007, Assumptions)

**Decision**: Accept the **existing shared logged-in home** for non-admin users; do not
differentiate a standard-user home in this feature. A user who signs in without a `returnTo`
lands on `"/"`, which renders today's logged-in home (`AdminHome` element for any signed-in
user, admin-only routes still admin-gated). No follow-up task filed from planning.

**Rationale**: Spec Assumptions and Out of Scope both place a differentiated standard-user home
out of scope ("possible follow-up"). FR-009 only requires that non-admins not _see admin
content_, which the existing per-route `user?.admin` checks already enforce. Changing the home
view here would expand scope (constitution VII / spec Out of Scope).

**Note carried to red-team**: the catch-all `"*"` route currently renders `<AdminHome/>` for any
signed-in user; confirm with red-team that "AdminHome as the generic logged-in home" exposes no
admin-only _actions_ to non-admins (the admin invitation routes are already separately gated by
`user?.admin`). This is a pre-existing condition, not introduced by this feature, but worth a
red-team look since the gate now guarantees every `"*"` visitor is authenticated.

---

## R5. Proving the guard is web-only (FR-012, FR-010 desktop isolation)

**Decision**: The guard, allowlist, and sanitizer live under `src/frontend/web/auth/` and are
imported **only** by `MainRouter`, which is imported **only** by `webApp.tsx`. The desktop entry
`desktopApp.tsx` renders `MainPage` and never imports `MainRouter` or `src/frontend/web/auth/*`.
This is enforced structurally (no platform flag needed) and asserted by:

- a static import-graph check / unit assertion that `AuthGate`/allowlist modules are not reached
  from the desktop entry; and
- the unchanged `MainPage.test.tsx` desktop suite continuing to pass.

**Rationale**: Confirmed by grep at plan time — only `webApp.tsx` and `MainRouter.tsx` reference
`MainRouter`; desktop is `desktopApp.tsx` → `MainPage`. Because the two targets render disjoint
React trees, code added to `MainRouter` is unreachable from desktop (brainstorm Key Decision).
This is the cleanest possible satisfaction of FR-012 (desktop entirely auth-free) — there is no
desktop code to change and no runtime branch to get wrong.

**Alternatives considered**:

- _A `PlatformContext`-gated guard rendered in shared code_ — rejected: introduces a runtime
  platform branch that could regress; the structural separation is stronger and simpler.

---

## Summary of resolved decisions

| Item                     | Decision                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Flicker on load (R1)     | Gate decision on `currentUserSlice.loaded`; show existing `LoadingSnake` until loaded.               |
| Return-to mechanism (R2) | `?returnTo=` query param + pure `safeReturnTo()` sanitizer (in-app paths only).                      |
| Logout / expiry (R3)     | Next-navigation redirect only; no 401 interceptor (API stays open).                                  |
| Non-admin home (R4)      | Reuse existing shared logged-in home; differentiation out of scope.                                  |
| Web-only proof (R5)      | Guard under `src/frontend/web/auth/`, reached only via `MainRouter`/`webApp.tsx`; desktop untouched. |
