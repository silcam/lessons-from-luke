# Feature Specification: Require Authentication on Web Content Routes

**Feature Branch**: `003-web-auth-gate`  
**Created**: 2026-06-22  
**Status**: Draft  
**Beads Epic**: `lessons-from-luke-i7j`  
**Brainstorm**: specs/brainstorms/2026-06-22-web-route-authentication-requirements.md  
**Input**: User description: "Require an authenticated user on the web app's non-admin content routes (e.g. /translate/<code>); redirect logged-out visitors to the login page and return them to their requested destination after sign-in. The Electron desktop client and the shared server API stay untouched."

**Beads Phase Tasks**:

- plan: `lessons-from-luke-i7j.1`
- red-team: `lessons-from-luke-i7j.2`
- tasks: `lessons-from-luke-i7j.3`
- analyze: `lessons-from-luke-i7j.4`
- implement: `lessons-from-luke-i7j.5`
- harden: `lessons-from-luke-i7j.6`

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign-in required to use the web app (Priority: P1)

A person opens the web app — for example by following a translation link such as
`/translate/6YI9AHY` — but is not signed in. Instead of seeing the content, they are shown the
sign-in page. Once they sign in with their account, they can use the translation surface
normally. People without an account cannot reach any non-public web content.

**Why this priority**: This is the core protective behavior the feature exists to deliver.
Without it, anyone holding a link can use the web translation surface anonymously. It is the
minimum viable slice — gating the web app behind sign-in delivers the feature's value on its
own.

**Independent Test**: Visit a content route (e.g. a translation page) while signed out and
confirm the sign-in page appears instead of the content; sign in and confirm the content then
renders. Fully testable without any other story.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in, **When** they navigate to a gated web route (e.g.
   a translation or lesson page), **Then** they are shown the sign-in page and do not see the
   gated content.
2. **Given** a signed-in user, **When** they navigate to a gated web route, **Then** the route's
   content renders normally.
3. **Given** a visitor who is not signed in, **When** the sign-in page is shown as a result of a
   redirect from a gated route, **Then** it displays a brief contextual prompt (e.g. "Please
   sign in to continue").

---

### User Story 2 - Return to the requested page after signing in (Priority: P1)

Someone is handed a deep link to a specific translation (e.g. `/translate/6YI9AHY`) while signed
out. After they are redirected to sign in and authenticate successfully, they land back on the
exact page they originally requested, rather than on a generic home page.

**Why this priority**: Translation links are meant to be shared and handed out, and invited
users follow such links. Dropping people on a generic home page after sign-in breaks the
shared-link and invite-then-translate flows, forcing them to re-find their destination.

**Independent Test**: While signed out, open a specific gated deep link, complete sign-in, and
confirm the browser lands on that same deep link (with its parameters intact).

**Acceptance Scenarios**:

1. **Given** a signed-out visitor who opened a gated deep link and was redirected to sign in,
   **When** they sign in successfully, **Then** they are returned to the originally-requested
   route, including its path parameters.
2. **Given** a user who opens the sign-in page directly (not via a redirect from a gated route),
   **When** they sign in successfully, **Then** they land on the home page.
3. **Given** a preserved post-login destination that points to an external or absolute URL,
   **When** sign-in completes, **Then** that destination is ignored and the user lands on the
   home page (only in-app destinations are honored).

---

### User Story 3 - Public pages stay reachable without an account (Priority: P2)

A newly invited recipient who does not yet have an account opens their invitation link and is
able to complete sign-up. Anyone can reach the sign-in page itself. These public entry points
are never blocked by the sign-in requirement.

**Why this priority**: The gate must not lock out the very flows that let people get an account
in the first place. It is P2 because it is a guardrail on US1 rather than new capability, but it
is mandatory — getting it wrong would break onboarding.

**Independent Test**: While signed out, open the invitation-redemption link and confirm the
sign-up form appears (not the sign-in wall); open the sign-in page directly and confirm it is
reachable.

**Acceptance Scenarios**:

1. **Given** a visitor who is not signed in, **When** they open the invitation-redemption route,
   **Then** the redemption form is shown rather than being redirected to sign in.
2. **Given** a visitor who is not signed in, **When** they open the sign-in page directly,
   **Then** it is shown normally (with no contextual redirect prompt).

---

### User Story 4 - Desktop translators keep working without sign-in (Priority: P1)

A translator using the Electron desktop application continues to work exactly as before:
offline, with no sign-in, no session, and no new prompts. Their translation and sync workflows
are unchanged by this feature.

**Why this priority**: A hard constraint of the feature. The desktop app is offline-first and
must remain entirely authentication-free; breaking it would be a serious regression. It is
verified as a non-regression alongside the web gate.

**Independent Test**: Use the desktop app to open and edit a translation and sync, with no
network sign-in, and confirm no authentication prompt or behavioral change appears.

**Acceptance Scenarios**:

1. **Given** the desktop application, **When** a translator opens and edits translations and
   syncs, **Then** no sign-in is required and behavior is identical to before this feature.
2. **Given** this feature is shipped, **When** the shared server data API is used (by web or
   desktop), **Then** its authentication requirements are unchanged.

### Edge Cases

- **Session still loading on first paint**: On initial app load the signed-in state is not yet
  known. The app MUST NOT bounce an already-authenticated user to sign-in during this window
  (no false redirect / flicker).
- **Session expires while viewing a gated page**: The user is not actively ejected mid-view; on
  the next navigation or reload the gate redirects them to sign in. (The data API stays open in
  this feature, so live ejection is out of scope.)
- **Signed-in non-admin requests an admin route**: They do not see admin content; existing
  behavior is preserved (admin content is not rendered for non-admins).
- **Crafted post-login destination pointing off-site**: Ignored; only in-app destinations are
  honored, falling back to the home page.
- **Expired or invalid invitation link**: Still reachable without sign-in (it is on the public
  allowlist); the existing invalid-invitation message is shown.
- **Sign-out from a gated page**: The user is left on the sign-in page, not on gated content.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The web app MUST require an authenticated user before rendering any route, except
  routes on an explicit public allowlist.
- **FR-002**: The public allowlist MUST consist of exactly the **sign-in page** and the
  **invitation-redemption route**; all other web routes (including content routes such as
  translation and lesson views) MUST require authentication.
- **FR-003**: Route gating MUST be **default-deny**: any newly added web route MUST be protected
  unless it is explicitly added to the public allowlist.
- **FR-004**: A visitor who is not signed in and requests a gated route MUST be shown the
  sign-in page instead of the gated content.
- **FR-005**: When the sign-in page is shown as the result of a redirect from a gated route, it
  MUST display a brief contextual prompt (e.g. "Please sign in to continue").
- **FR-006**: After a successful sign-in that followed a redirect from a gated route, the user
  MUST be returned to the originally-requested route, including its path parameters.
- **FR-007**: A user who signs in without having been redirected from a gated route MUST land on
  the home page.
- **FR-008**: The destination preserved for post-login return MUST be restricted to in-app
  paths; external or absolute URLs MUST NOT be honored.
- **FR-009**: Admin routes MUST continue to require an admin user; a signed-in non-admin who
  requests an admin route MUST NOT see admin content (existing behavior preserved).
- **FR-010**: While the signed-in state is still being determined on initial load, the web app
  MUST NOT redirect an already-authenticated user to sign-in.
- **FR-011**: When a user signs out, or has no valid session, while on a gated route, they MUST
  be left on the sign-in page rather than on gated content.
- **FR-012**: The Electron desktop client MUST remain entirely free of authentication checks —
  no sign-in and no session — and require no changes to the desktop translation or sync
  experience.
- **FR-013**: This feature MUST NOT add or change authentication requirements on the shared
  server data API; existing API access (used by both web and desktop) MUST remain unchanged.

### Key Entities

This feature introduces **no new persisted data**. It builds on the existing authenticated
session. The conceptual objects involved are:

- **Public allowlist**: the explicit set of web routes reachable without authentication (the
  sign-in page and the invitation-redemption route).
- **Gated route**: any web route not on the public allowlist; requires an authenticated user.
- **Intended destination**: the in-app route a signed-out visitor originally requested, retained
  so they can be returned to it after signing in.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A signed-out visitor opening any gated web route is shown the sign-in page and
  cannot view the gated content — for 100% of gated routes.
- **SC-002**: After signing in from a gated deep link, the user lands on the exact in-app route
  they originally requested (with parameters preserved) for all gated in-app destinations.
- **SC-003**: The sign-in page and the invitation-redemption link are reachable and usable with
  no account, so newly invited users can still complete sign-up.
- **SC-004**: Desktop translators complete translation and sync with zero sign-in prompts and no
  behavioral change versus before this feature.
- **SC-005**: No shared server data API endpoint changes its authentication behavior; the
  existing automated tests for those endpoints pass unchanged.
- **SC-006**: An already-authenticated user who reloads or deep-links into a gated route is
  never erroneously redirected to sign-in due to session-load timing (zero false redirects).

## Clarifications

### Session 2026-06-22

- Q: Where should the auth requirement be enforced, given that web and desktop hit the same API
  and are indistinguishable server-side? → A: On the **web client** only (a route gate);
  desktop and the JSON data API stay untouched. Real server-side API / per-translation
  authorization is deferred to the future desktop-auth feature that gives desktop its own
  credential.
- Q: After a signed-out visitor signs in from a gated link, where do they land? → A: Back on the
  originally-requested page (deep-link return-to).
- Q: What should the sign-in page communicate when shown via a redirect from a gated link? → A:
  The existing sign-in form plus a brief contextual prompt ("Please sign in to continue").

## Assumptions

- Relies on the existing authenticated session and the session state already loaded when the web
  app starts (including a flag indicating whether that load has completed). The gate consults
  this existing state rather than introducing a new source of auth truth.
- The gate waits for session-load completion before deciding whether to redirect (FR-010); the
  exact mechanism is a planning detail.
- The mechanism for preserving and restoring the intended destination across sign-in (and
  constraining it to in-app paths, FR-008) is a planning detail.
- Default handling of mid-session expiry is "redirect on next navigation" rather than active
  live ejection (the data API remains open in this feature); revisit if needed during planning.
- The standard (non-admin) signed-in user lands on the existing logged-in home view;
  differentiating a standard-user home is **out of scope** and a possible follow-up.
- This feature is **stacked on `002-invitation-system`** (currently unmerged) and depends on the
  authentication and invitation work below.

## Dependencies

- **`001-better-auth-migration`**: provides the authenticated session, the auth client, and the
  current-user state the gate consults.
- **`002-invitation-system`**: provides the invitation-redemption route that MUST remain on the
  public allowlist.

## Out of Scope

- Server-side API authorization or hardening (the shared data API stays as open as it is today;
  it cannot be gated without giving desktop a distinguishing credential).
- Per-translation (resource-level) authorization — which user may edit which language. Future
  feature.
- Desktop authentication integration. Future feature.
- New sign-in UI or public self-service sign-up (account creation stays invitation-only).
- Any change to the standard (non-admin) user's home/landing experience.
