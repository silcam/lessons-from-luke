# Implementation Plan: Require Authentication on Web Content Routes

**Branch**: `003-web-auth-gate` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-web-auth-gate/spec.md`

## Summary

Gate every web route behind a logged-in user **on the web client only**, with a small,
default-deny route guard (`AuthGate`) inside the web-only `MainRouter`. A signed-out visitor
who requests a gated route is shown the existing sign-in page and, after authenticating, is
returned to the in-app route they originally requested (deep-link return-to), guarded against
open-redirect. The sign-in page and the invitation-redemption route (`/invitation/:token`) stay
on a public allowlist. The Electron desktop client (which renders `MainPage`, never
`MainRouter`) and the shared server `/api/*` data API are **untouched** — the guard is
structurally incapable of affecting them. This feature introduces **no new persisted data** and
**no server API changes**.

## Technical Context

**Language/Version**: TypeScript (ES2022, CommonJS, strict + all strict flags), Node 24 (nvm).
React 16, React Router DOM `^6.30.0`, Redux Toolkit.
**Primary Dependencies**: Existing better-auth client (`authClient`), `currentUserSlice`
(`{ user: User | null, loaded: boolean, error }`), `loadCurrentUser` thunk, React Router v6
(`Navigate`, `useLocation`, `useNavigate`, `Outlet`), `react-redux`.
**Storage**: N/A — no new persisted data. Builds entirely on the in-memory Redux session state
already populated on mount by `loadCurrentUser()`.
**Testing**: Jest + React Testing Library (`renderWithProviders` with `MemoryRouter` from
`src/frontend/common/testHelpers.tsx`); Cypress E2E for the user-facing web flow. TDD is
mandatory (constitution Principle I): red-green-refactor for every unit.
**Target Platform**: Web frontend only (`src/frontend/web/`). Desktop and server explicitly
excluded.
**Project Type**: Web (isomorphic four-layer architecture). Change is confined to the
`frontend/web` layer.
**Performance Goals**: No measurable runtime cost; guard is a synchronous render-time decision
on top of already-loaded Redux state. No new network calls (session already fetched on mount).
**Constraints**:
- MUST NOT redirect an already-authenticated user during initial session load — wait for
  `currentUserSlice.loaded` before deciding (FR-010, SC-006; no redirect flicker).
- Return-to destination MUST be restricted to same-app relative paths; absolute/external URLs
  ignored, fall back to home (FR-008).
- MUST NOT add platform branching: the guard lives only in `MainRouter`, which desktop never
  imports (verified — see research.md R5).
- Default-deny: structurally protect the route subtree so new routes are gated automatically
  (FR-003).
**Scale/Scope**: Single guard component + one allowlist constant + one pure return-to
sanitizer + small edits to `MainRouter`, `PublicHome`, and the sign-in thunk path. ~5 source
files touched/created plus their co-located tests.

## Brainstorm Context

**Source**: [specs/brainstorms/2026-06-22-web-route-authentication-requirements.md](../brainstorms/2026-06-22-web-route-authentication-requirements.md)

### Key Decisions Carried Forward

- **Web route guard, not server-side gating**: web and desktop are indistinguishable at the
  shared `/api/*` API, so honest server gating requires a desktop credential = future work. The
  client-side guard is the right-sized, honest step now.
- **Guard lives in `MainRouter` (web-only)**: desktop renders `MainPage` instead, so the gate
  is structurally incapable of affecting desktop — no platform flag needed.
- **Default-deny allowlist**: public = sign-in page + `/invitation/:token`; everything else is
  gated, and new routes are protected automatically.
- **Deep-link return-to**: shared `/translate/<code>` links and invite-then-translate flows
  depend on landing the user back where they intended after sign-in.

### Deferred Questions (resolved during planning)

- *Wait for `loaded` before deciding* → The guard reads `currentUserSlice.loaded`; while
  `false` it renders the existing `LoadingSnake` (the same loading affordance `MainRouter`
  already shows) and makes no redirect decision. Resolved (research.md R1).
- *Preserve/restore intended destination — router state vs. query param* → Use a `?returnTo=`
  query param on the sign-in redirect, sanitized to same-app relative paths. Chosen over
  React Router location-state because it survives a full page reload and is inspectable.
  Resolved (research.md R2).
- *Logout / mid-session expiry: active ejection vs. next-navigation* → Next-navigation only;
  no API 401 interceptor in this feature (the data API stays open). Resolved (research.md R3).
- *Confirm the shared non-admin home is acceptable* → Yes; differentiating the standard-user
  home is explicitly out of scope (spec Assumptions + Out of Scope). No follow-up filed here.
  Resolved (research.md R4).
- *Confirm desktop never imports `MainRouter`/the guard* → Confirmed by grep: only
  `webApp.tsx` imports `MainRouter`; desktop entry is `desktopApp.tsx` → `MainPage`. A guard
  test will additionally assert the allowlist/guard module is web-only. Resolved (research.md
  R5).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Notes |
| --------- | ------ | ----- |
| I. Test-First Development (NON-NEGOTIABLE) | PASS (planned) | Pure return-to sanitizer, allowlist membership, and `AuthGate` decision logic are all unit-testable with `renderWithProviders` + `MemoryRouter`. Cypress E2E covers the deep-link return-to flow. Red-green-refactor for every unit; aim for the standing 100% coverage aspiration (≥95% enforced). |
| II. Type Safety and Static Analysis | PASS (planned) | No `any`; explicit return types on every function; `type`-only imports for types; strict-boolean expressions (e.g. `loaded === false`, `user !== null`, not truthy checks). Allowlist is a typed `readonly` tuple. |
| III. Code Quality Standards | PASS (planned) | JSDoc on the exported `AuthGate`, the allowlist constant, and the `safeReturnTo` helper. PascalCase component, kebab-case domain concepts mirrored from the glossary. Import order preserved. |
| IV. Pre-commit Quality Gates | PASS (planned) | `yarn typecheck` + lint-staged (eslint --fix, prettier, jest --findRelatedTests) run on commit; never bypassed. Conventional commits. |
| V. Warning and Deprecation Policy | PASS (planned) | Zero new warnings; no deprecated APIs introduced (React Router v6 `Navigate`/`Outlet` are current). |
| VI. Layered Architecture and Dual Deployment Targets | PASS | Change confined to `src/frontend/web/`. `core` untouched (stays isomorphic). No `Persistence` involvement (no domain data). Desktop offline path and the shared API untouched (FR-012, FR-013). The guard's web-only placement *is* the architectural enforcement. |
| VII. Simplicity and Maintainability | PASS | YAGNI: no 401 interceptor, no new login UI, no new state source. KISS: one guard + one allowlist + one sanitizer. DRY: reuses existing `currentUserSlice`, `LoadingSnake`, `PublicHome`. |

**Initial gate**: PASS. No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-web-auth-gate/
├── plan.md          # This file
├── research.md      # Phase 0 output (decisions R1–R5)
├── quickstart.md    # Phase 1 output (verification walkthrough)
└── spec.md          # Feature specification (input)
# data-model.md and contracts/ intentionally OMITTED:
#   no new persisted data (spec Key Entities) and no server API changes (FR-013).
```

### Source Code (repository root)

```text
src/frontend/web/
├── MainRouter.tsx                    # EDIT: wrap gated routes in <AuthGate>; keep public routes outside
├── auth/
│   ├── AuthGate.tsx                  # NEW: web-only route guard (loaded-gate + redirect + return-to)
│   ├── AuthGate.test.tsx             # NEW: unit tests for the guard's decision logic
│   ├── publicAllowlist.ts            # NEW: named, typed public allowlist + isPublicPath() (default-deny)
│   ├── publicAllowlist.test.ts       # NEW: allowlist membership + default-deny tests
│   ├── safeReturnTo.ts               # NEW: pure same-app-path sanitizer (open-redirect guard)
│   ├── safeReturnTo.test.ts          # NEW: exhaustive sanitizer tests (absolute/protocol-relative/external)
│   └── authThunks.ts                 # EDIT: sign-in success navigates to sanitized returnTo (or "/")
└── home/
    ├── PublicHome.tsx                # EDIT: show contextual "Please sign in to continue" prompt when redirected
    └── PublicHome.test.tsx           # NEW/EDIT: prompt-rendering tests

cypress/integration/
└── web-auth-gate.spec.ts             # NEW (or extend existing): E2E deep-link return-to + allowlist
```

**Structure Decision**: All changes live in the web frontend layer (`src/frontend/web/`), the
only layer that renders `MainRouter`. The guard, allowlist, and sanitizer are co-located under
`src/frontend/web/auth/` alongside the existing `authClient.ts` / `authThunks.ts`, keeping the
authentication concern in one place. No `core`, `server`, or `desktop` files are touched, which
is what makes desktop and the shared API provably unaffected (constitution Principle VI).

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec gets a
> corresponding acceptance spec file created during `sp:05-tasks` under
> `specs/acceptance-specs/`. The files below are documented here; `sp:05-tasks` creates them.

| User Story | Acceptance Spec File | Scenarios |
| ---------- | -------------------- | --------- |
| US1: Sign-in required to use the web app | `specs/acceptance-specs/US01-sign-in-required.txt` | 3 |
| US2: Return to the requested page after signing in | `specs/acceptance-specs/US02-return-to-after-sign-in.txt` | 3 |
| US3: Public pages stay reachable without an account | `specs/acceptance-specs/US03-public-pages-reachable.txt` | 2 |
| US4: Desktop translators keep working without sign-in | `specs/acceptance-specs/US04-desktop-unchanged.txt` | 2 |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` →
`acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

**Notes on layer mapping** (for `sp:05-tasks`):
- US1, US2, US3 are verified primarily by component/integration tests
  (`renderWithProviders` + `MemoryRouter`) plus a Cypress E2E for the real deep-link reload of
  US2.
- US4 is a **non-regression assertion**, not new code: verified by a guard-module import-graph
  test (the allowlist/guard is web-only) plus the unchanged desktop suite
  (`MainPage.test.tsx`) and the unchanged server `/api/*` suites continuing to pass (SC-004,
  SC-005). There is no desktop code to write.

## Presentation Design

**Component Framework**: React 16 + the existing `base-components/` kit
(`MiddleOfPage`, `Heading`, `PDiv`, `Alert`, `Button`, `TextInput`), Redux Toolkit state,
React Router v6 navigation.
**Interaction Patterns**: Render-time route guard (`<AuthGate>` wrapping an `<Outlet/>` or the
gated element subtree); declarative `<Navigate to="/?returnTo=…" replace />` redirect;
post-sign-in `navigate(returnTo)` from the thunk-completion path.
**Accessibility Target**: WCAG 2.2 AA — consistent with `PRODUCT.md` accessibility goals. The
contextual prompt must be a real visible text element (not color-only), reusing the existing
`Alert`/`Heading` components.

### UI Decisions

| Screen / Component | User Story | Approach | Design Skills |
| ------------------ | ---------- | -------- | ------------- |
| Sign-in page "Please sign in to continue" contextual prompt | US1 | Reuse `PublicHome`; add a conditional `Alert`/sub-heading shown only when arriving via redirect (detected from the presence of a sanitized `returnTo`). No new screen. | `/design-clarify` (microcopy) |
| Loading affordance during session-load window | US1 | Reuse the existing `LoadingSnake` that `MainRouter` already shows while `loaded === false`; no new component. | — |

No genuinely new screens are introduced. The only user-visible change is one line of contextual
copy on the existing sign-in page (DESIGN.md / "Field Manual" register: clear, utilitarian).
The invitation and sign-in screens noted as "unfinished" in `CLAUDE.md` are **not** in scope to
restyle here.

### Quality Pass

**Design quality target**: MVP (this is a guardrail feature; one line of copy + reuse of the
existing kit, no new surface).
**Post-implementation refinement**: `/design-clarify` for the contextual prompt wording (ensure
it reads as "Field Manual" voice and is i18n-keyed like the rest of `PublicHome`). No
`/design-polish` pass planned — there is no new visual surface to polish.

## Security Considerations

> Added by `/sp:04-red-team` (pass 1). These harden the client-side gate against the realistic
> attack surface of a `BrowserRouter` web app that reflects an attacker-controllable `returnTo`
> param into navigation. The gate is a UX/authn boundary on the **client only** — it is **not**
> an authorization boundary (the shared `/api/*` stays open per FR-013); these notes keep the
> client gate honest, they do not claim server enforcement.

### Open-Redirect Defense (`safeReturnTo`) — exhaustive reject list

`safeReturnTo` is the single chokepoint for FR-008 and MUST be exhaustively unit-tested. The
"accept only `/` + non-`/`" rule from research R2 is necessary but **not sufficient**; the
sanitizer MUST also defeat these concrete bypasses (each gets a test case):

- **Backslash variants** — browsers normalize `\` to `/` in URLs, so `/\evil.com`,
  `\/evil.com`, `/\/evil.com` are protocol-relative escapes. Reject any value containing `\`
  (do not merely look for a leading `//`).
- **Protocol-relative** — `//evil.com`, `//evil.com/path`. Reject any value whose first two
  significant characters are `/` `/`.
- **Scheme injection** — `javascript:`, `data:`, `vbscript:`, `http:`, `https:`, `mailto:`, or
  any `scheme:` prefix. Reject anything containing a `:` before the first `/`, and reject the
  literal `javascript:`/`data:` substrings case-insensitively.
- **Control-character / whitespace injection** — leading or embedded `\t`, `\n`, `\r`, NUL, and
  Unicode whitespace (browsers strip these from URLs, turning `/\tjavascript:alert(1)` into a
  scheme). Reject any value containing an ASCII control char (0x00–0x1F, 0x7F) or leading
  whitespace; do not trim-then-accept.
- **Encoding bypasses** — `%2F%2Fevil.com`, `%5Cevil.com`, double-encoded `%252F`. Decode at
  most once with `decodeURIComponent`, then **re-validate** the decoded value against all rules
  above; if `decodeURIComponent` throws (malformed `%`), reject. Never accept a value that only
  passes validation before decoding.
- **Authority confusion** — `/@evil.com`, `/.evil.com`, `https:/evil.com` (single slash).
  Because the accepted shape is "starts with `/` then a non-`/`, non-`\`, non-control char and
  contains no scheme/host", these fall out; assert them anyway.
- **Backreference / fragment smuggling** — preserve only `pathname + search`; **strip the
  fragment** (`#...`) before validation/return so a `#` cannot smuggle a second URL past the
  router. Only same-origin in-app paths (a leading `/` resolved relative to the app origin) are
  ever returned; on any rejection return `"/"`.

Prefer an allowlist construction (`new URL(raw, window.location.origin)` then assert
`url.origin === window.location.origin` and return `url.pathname + url.search`) **as a
cross-check** alongside the string rules, but keep the function pure/testable by injecting the
origin rather than reading `window` directly. Document which approach is authoritative so tests
target it.

### No reflection of `returnTo` (reflected-XSS / redirect-prompt safety)

The attacker-controllable `returnTo` value MUST NOT be rendered into the DOM anywhere — not in
the "Please sign in to continue" prompt, not in an error message, not in a visible "returning
you to X" affordance. The contextual prompt is **static copy**; redirect-arrival is detected
from the *presence* of a (sanitized) `returnTo`, never by displaying its contents. This closes
the reflected-XSS vector that a `returnTo=<script>`/`returnTo="><img onerror>` would otherwise
open if the value were echoed. (React escapes by default, but an explicit "never render
`returnTo`" rule prevents a future `dangerouslySetInnerHTML`/`title=`/`href=` regression.)

### Redirect target is the catch-all sign-in surface, not a `/login` path

There is **no dedicated `/login` route**: the sign-in form is `PublicHome`, rendered by the
catch-all `"*"` route only when `user === null`. The gate's redirect therefore targets `"/"`
(`<Navigate to={`/?returnTo=${enc}`} replace />`), which the signed-out catch-all renders as
`PublicHome`. Consequences the design MUST honor:

- `safeReturnTo` MUST treat `/` and the public routes as valid-but-benign targets (returning a
  signed-in user who deep-linked with `returnTo=/` simply lands home — no loop).
- A redirect to `/` while signed out renders `PublicHome`; the guard MUST NOT also wrap the
  catch-all in `AuthGate` (that would create a redirect loop `/` → `/?returnTo=/` → `/` …). The
  catch-all and `/invitation/:token` are the *only* ungated routes; all **named content routes**
  (`/translate/:code`, `/lessons/:id`, `/usfmImportResult`, `/languages/.../docStrings`,
  `/update-issues/:lessonId`) are wrapped by the guard. State this loop-freedom invariant as a
  test (`AuthGate` never redirects a public path to itself).
- Use `replace` on the redirect so the gated URL is not left in history (back-button does not
  re-trigger a redirect ping-pong).

### `returnTo` only honored on the gate-driven sign-in path

The post-login navigation reads `returnTo` and calls `navigate(safeReturnTo(returnTo))`. A
crafted `returnTo` can at worst send the *authenticated* user to an in-app path they already
have access to (the sanitizer guarantees in-app-only), so there is no privilege gain — but
document that `returnTo` confers **no authorization**: it only chooses an in-app destination,
and every destination is itself still subject to its own route's `user?.admin` checks (FR-009).

## Edge Cases & Error Handling

> Added by `/sp:04-red-team` (pass 1).

### Session-load failure must not hang the gate (availability)

`AuthGate` only decides once `currentUserSlice.loaded === true`, and `loaded` is flipped true
**only** by `setUser` inside `loadCurrentUser`. The current `loadCurrentUser` thunk has **no
try/catch**: if `authClient.getSession()` rejects (network blip, server 5xx, CORS), `setUser`
is never dispatched, `loaded` stays `false` forever, and the guard renders `LoadingSnake`
indefinitely — the whole web app is bricked for a transient error. The design MUST:

- Wrap `loadCurrentUser`'s `getSession()` in try/catch and, on failure, dispatch
  `setUser(null)` (treat an unresolvable session as signed-out, which routes through the gate
  to sign-in) so `loaded` always becomes `true`. This is a real change to an existing thunk and
  belongs in this feature's scope because the gate newly *depends* on `loaded` becoming true.
- Add a unit test: `getSession` rejection → `loaded === true`, `user === null`, no infinite
  loading.

### `loaded`-flag invariant under sign-out and error

- `setError` does **not** set `loaded` — fine, because `loaded` is already `true` by the time a
  login is attempted. But assert that a failed login (`setError`) does **not** flip `loaded`
  back to `false` (it must not re-trigger the loading gate).
- `pushLogout` dispatches `setUser(null)`, which keeps `loaded === true` with `user === null`;
  the next render through `AuthGate` redirects the (now-gated) current route to sign-in
  (FR-011). Assert this in the `AuthGate` decision matrix test (signed-in → sign-out while on a
  gated route → redirect to `/`).

### Stale `currentUser.error` bleeding onto the redirect prompt

`currentUserSlice.error` is cleared **only** by `setUser`, and `useClearBannersOnNavigation`
does not clear it. So a "Log in failed" alert from a prior attempt can persist when the user is
later redirected to the gate and shown the "Please sign in to continue" prompt, producing a
confusing double message. Decide and document: clear `error` on the redirect-arrival render (or
on navigation to the public surface) so the contextual prompt is shown on a clean slate. Add a
test that arriving via redirect after a prior failed login does not show a stale error.

### Login attempt while already redirected (returnTo present)

If the user fails login on the gate (wrong password) with a `returnTo` present, they stay on
`/?returnTo=…` (URL preserved), see the failure alert, and can retry — `returnTo` MUST survive
the failed attempt and only be consumed on success. Assert `returnTo` is read at navigation
time (on success), not cleared on failure.

### Concurrent / double session load

`loadCurrentUser` is dispatched in `useEffect([])` on `MainRouter` mount. Under React 18
StrictMode (dev) or a remount, it can fire twice; both resolve to the same `setUser`, which is
idempotent — acceptable. No guard needed, but note it so a future "load once" optimization is
not mistaken for a correctness fix.

### Mid-session expiry stays next-navigation-only (confirming R3)

Confirmed in scope: no 401 interceptor (FR-013, API stays open). A session that expires while a
gated page is mounted is not actively ejected; the next navigation/reload re-evaluates
`AuthGate`. Because `loadCurrentUser` runs only on mount, a *long-lived SPA session that expires
without a reload* will keep `user` populated in Redux and the gate will not notice until a
reload re-runs `getSession`. This is an accepted limitation (the data API stays open, so there
is no security regression vs. today); document it explicitly so it is a known boundary, not a
surprise.

## Accessibility Requirements

> Added by `/sp:04-red-team` (pass 1). Target: WCAG 2.2 AA (per Presentation Design + PRODUCT.md).

### Redirect announcement and focus management

A `<Navigate replace>` route change is a silent DOM swap — a screen-reader user who deep-linked
into a gated route and was bounced to sign-in gets **no indication** of why the page changed.
The design MUST:

- Render the "Please sign in to continue" contextual prompt in an assertive live region
  (`role="alert"` or `aria-live="assertive"`) so it is announced on arrival via redirect.
  Verify the reused `Alert` base-component carries `role="alert"`; if it does not, add it for
  this usage (do not rely on visual-only signaling — WCAG 1.4.1, 4.1.3 Status Messages).
- Move focus to the sign-in form's first field (the email `TextInput` already has `autoFocus`)
  **or** to the prompt heading on redirect arrival, so keyboard/SR users are oriented at the
  top of the new context (WCAG 2.4.3 Focus Order).

### Loading affordance is perceivable

The `LoadingSnake` shown while `loaded === false` is a visual spinner. For the session-load
window (and the new failure path above), ensure it is not the *only* signal — it already gates
a brief moment, but if the failure path keeps a user waiting, the fallback to sign-in (per the
edge-case fix) is what prevents a silent hang for SR users. No new affordance required beyond
ensuring `loaded` always resolves.

### Contextual prompt is text, not color

Per Presentation Design the prompt is already a real visible text element (not color-only) —
restated here as an explicit acceptance check: the "Please sign in to continue" message MUST be
conveyed by text content, satisfying WCAG 1.4.1 (Use of Color).

## Design Consistency Notes (resolve in `sp:05-tasks`)

> Added by `/sp:04-red-team` (pass 1). No `contracts/` or `data-model.md` exist for this feature
> (no new persisted data, no API changes — correctly omitted), so there are no interface- or
> data-shape artifacts to propagate into. These are internal plan/research congruence items for
> task generation.

- **Where the post-login `navigate` lives.** The Source Structure table lists
  `authThunks.ts` as `EDIT` ("sign-in success navigates to sanitized returnTo"), but research R2
  *prefers Option 1* — keep `pushLogin` pure of routing and do `navigate(safeReturnTo(returnTo))`
  in `PublicHome` (where `useNavigate` lives). These disagree. Resolve to **Option 1**: drop the
  `authThunks.ts` edit from the gated-navigation path (the thunk stays routing-free), and add the
  `useSearchParams` + `navigate` logic to `PublicHome` instead. `pushLogin`'s existing
  `callbackURL: "/"` is a better-auth server-redirect hint the in-place email flow does not act
  on (research R2) and can be left as-is. `sp:05-tasks` should generate the `PublicHome` edit, not
  an `authThunks` edit, for return-to navigation.
- **Allowlist shape vs. actual routing.** `publicAllowlist`/`isPublicPath()` describe a set of
  paths, but the real public surface is (a) the catch-all `"*"` when signed out and (b)
  `/invitation/:token`. Document that the allowlist's job is to identify which **named** routes
  bypass `AuthGate`, and that the catch-all is structurally public (not listed by literal path).
  `/invitation/:token` is a parameterized pattern — `isPublicPath` MUST match the *pattern*
  (prefix `/invitation/`), not a literal string, or a real token path will be gated.

## Applied Learnings

No entries in `.specify/solutions/` are relevant: the only catalogued solutions are in the
`tooling/` category (ralph/spec-kit harness issues), none touching React routing, auth guards,
or open-redirect handling. (Checked `.specify/solutions/security/` and
`.specify/solutions/clean-architecture/` during red-team pass 1 — neither directory exists, so
no previously-solved pattern applies.) Section retained empty intentionally.

## Complexity Tracking

> No constitutional violations. This section is intentionally empty.
