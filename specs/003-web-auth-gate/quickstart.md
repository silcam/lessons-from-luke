# Quickstart: Verifying the Web Authentication Gate

A short, manual walkthrough to confirm the feature behaves per spec. Run against the **web**
app (`yarn dev-web`). The desktop app and the server `/api/*` API are out of scope and must be
unchanged.

## Prerequisites

- `yarn dev-web` running (webpack-dev-server + TS watch + Express).
- At least one account that can sign in (created via the invitation flow from
  `002-invitation-system`), and optionally one admin account.
- This branch (`003-web-auth-gate`) is stacked on `002-invitation-system`.

## 1. Gated route blocks a signed-out visitor (US1 / FR-001, FR-004)

1. Sign out (or open a fresh private window).
2. Navigate directly to a gated deep link, e.g. `http://localhost:<port>/translate/6YI9AHY`.
3. **Expect**: the sign-in page is shown — not the translation content.
4. **Expect**: a brief contextual prompt is visible, e.g. "Please sign in to continue"
   (FR-005). The URL carries a sanitized `?returnTo=%2Ftranslate%2F6YI9AHY`.

## 2. Deep-link return-to after sign-in (US2 / FR-006)

1. Continuing from step 1 (you are on the sign-in page with `returnTo` set), sign in with a
   valid account.
2. **Expect**: you land back on `/translate/6YI9AHY` (path params intact) and can translate —
   **not** on the generic home page.

## 3. Direct sign-in lands on home (US2 / FR-007)

1. Sign out. Open the sign-in page directly (`http://localhost:<port>/`), with no `returnTo`.
2. **Expect**: no contextual redirect prompt is shown.
3. Sign in. **Expect**: you land on the home page.

## 4. Open-redirect is rejected (US2 / FR-008)

1. Sign out. Manually craft a sign-in URL with a hostile destination, e.g.
   `http://localhost:<port>/?returnTo=https://evil.example.com` (also try
   `//evil.example.com` and `/\evil.example.com`).
2. Sign in.
3. **Expect**: the external destination is ignored; you land on the home page.

## 5. Public allowlist stays reachable signed-out (US3 / FR-002)

1. Sign out.
2. Open the invitation-redemption link `http://localhost:<port>/invitation/<token>`.
3. **Expect**: the redemption form appears (or the existing invalid/expired message for a bad
   token) — **not** the sign-in wall.
4. Open the sign-in page directly — **expect** it renders normally with no redirect prompt.

## 6. Admin routes still require admin (FR-009)

1. Sign in as a **non-admin** user.
2. Navigate to an admin route, e.g. `/admin/invitations`.
3. **Expect**: no admin content is rendered (existing behavior preserved); you are not handed
   admin capability by virtue of merely being authenticated.

## 7. No false redirect on reload (FR-010 / SC-006)

1. Sign in, navigate to a gated route (e.g. `/translate/6YI9AHY`).
2. Hard-reload the page (Cmd/Ctrl-R).
3. **Expect**: you stay on the gated content. There is a brief loading affordance
   (`LoadingSnake`) while the session loads, then the content — you are **never** bounced to
   sign-in.

## 8. Sign-out from a gated page (FR-011)

1. While signed in on a gated route, sign out.
2. **Expect**: you are left on the sign-in page, not on gated content.

## 9. Desktop is unaffected (US4 / FR-012, FR-013)

1. Run the desktop app (`yarn dev-desktop`, with `dev-web` running).
2. Open and edit a translation; sync.
3. **Expect**: no sign-in prompt, no session, no behavioral change. The shared `/api/*`
   endpoints behave exactly as before for both web and desktop.

## Automated coverage

- Unit/component (Jest + `renderWithProviders` + `MemoryRouter`): `safeReturnTo` sanitizer,
  `publicAllowlist` membership + default-deny, `AuthGate` decision matrix (loading / signed-in /
  signed-out / allowlisted), `PublicHome` contextual prompt.
- E2E (Cypress): the steps 1–2 deep-link return-to flow with a real reload, and step 5 allowlist
  reachability.
- Non-regression: existing `MainPage.test.tsx` (desktop) and server `/api/*` suites pass
  unchanged (SC-004, SC-005).
