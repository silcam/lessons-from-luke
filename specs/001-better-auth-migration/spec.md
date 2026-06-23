# Feature Specification: Better-Auth Migration

**Feature Branch**: `001-better-auth-migration`
**Created**: 2026-06-05
**Status**: Draft
**Brainstorm**: specs/brainstorms/2026-06-05-better-auth-migration-requirements.md
**Implementation Reference**: /Users/eykd/.claude/plans/please-investiagte-the-auth-rippling-stearns.md
**Beads Epic**: `lessons-from-luke-47t`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-47t.1`
- red-team: `lessons-from-luke-47t.2`
- tasks: `lessons-from-luke-47t.3`
- analyze: `lessons-from-luke-47t.4`
- implement: `lessons-from-luke-47t.5`
- harden: `lessons-from-luke-47t.6`

**Input**: Apply the better-auth migration per the brainstorm requirements, refreshed against current
master and the pre-commit/CI/constitution gates. Prerequisite Principle VI constitution amendment is
complete (v1.1.0). Auth talks to PostgreSQL through its own isolated driver, leaving the domain
storage layer untouched.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Administrator signs in securely (Priority: P1)

A curriculum administrator opens the web application and signs in with their **email address** and
password. The password is verified against a securely **hashed** stored credential — never a
plaintext comparison. On success the administrator lands on the admin home and can perform admin
functions.

**Why this priority**: This is the security heart of the feature. Today the only admin logs in with a
hardcoded username/password compared in plaintext, which is the defect being removed. Without this,
nothing else has value.

**Independent Test**: With the admin account provisioned, submit the login form with the correct
email + password and confirm the administrator reaches admin functions; confirm the stored credential
is a hash, not plaintext.

**Acceptance Scenarios**:

1. **Given** a provisioned admin account, **When** the admin submits the correct email and password,
   **Then** a session is established and the admin reaches admin functions.
2. **Given** a provisioned admin account, **When** the admin submits a wrong password, **Then** sign-in
   is rejected with a clear failure state, no session is created, and the response does not reveal
   whether the email exists.
3. **Given** the stored credential, **When** it is inspected, **Then** it is a one-way hash (Argon2id),
   never the plaintext password.

---

### User Story 2 - Admin-only areas are protected (Priority: P1)

Admin-only endpoints must reject anyone who is not a signed-in administrator, distinguishing
"not signed in" from "signed in but not an admin".

**Why this priority**: Authentication is only useful if it actually gates protected functionality.
This is an independently testable slice and a hard security requirement.

**Independent Test**: Call an admin-only endpoint while logged out, while logged in as a non-admin,
and while logged in as an admin; confirm the three distinct outcomes.

**Acceptance Scenarios**:

1. **Given** no session, **When** an admin-only endpoint is requested, **Then** the system responds
   **401 Unauthorized**.
2. **Given** a signed-in **non-admin** session, **When** an admin-only endpoint is requested, **Then**
   the system responds **403 Forbidden**.
3. **Given** a signed-in **admin** session, **When** an admin-only endpoint is requested, **Then** the
   request succeeds.

---

### User Story 3 - Administrator signs out (Priority: P2)

A signed-in administrator can end their session, after which protected functionality is no longer
accessible until they sign in again.

**Why this priority**: Expected, low-risk completion of the session lifecycle; valuable but not the
MVP core.

**Acceptance Scenarios**:

1. **Given** a signed-in admin, **When** they sign out, **Then** the session ends and the session
   cookie is cleared.
2. **Given** a just-signed-out admin, **When** an admin-only endpoint is requested, **Then** the system
   responds 401.

---

### User Story 4 - Invitation-only provisioning (Priority: P2)

There is no public sign-up. The single administrator account is provisioned automatically from
configured deployment credentials, and provisioning is safe to repeat.

**Why this priority**: Establishes the invitation-only posture and a reliable bootstrap path for the
admin, without which an operator cannot get the first account in.

**Acceptance Scenarios**:

1. **Given** a fresh environment with admin credentials configured, **When** provisioning runs, **Then**
   exactly one admin account exists with the configured email and admin capability.
2. **Given** provisioning has already run, **When** it runs again, **Then** no duplicate account is
   created and no error occurs (idempotent).
3. **Given** required admin configuration is missing, **When** provisioning runs, **Then** it fails
   loudly with a clear message.
4. **Given** the running system, **When** anyone attempts public self-service sign-up, **Then** it is
   rejected.

---

### User Story 5 - Desktop translation is unaffected (Priority: P2)

A desktop translator continues to use the application exactly as before. The desktop app authenticates
with its per-translation access code and never touches the user-auth system.

**Why this priority**: A non-regression guarantee. The migration must not disturb the offline desktop
experience.

**Acceptance Scenarios**:

1. **Given** the desktop app, **When** a translator opens a translation with an access code, **Then**
   the workflow behaves exactly as before.
2. **Given** the desktop codebase, **When** inspected, **Then** it contains no dependency on the new
   user-auth system.

---

### Edge Cases

- **Existing sessions at cutover**: legacy signed-cookie sessions become invalid when the old system is
  removed; the administrator must sign in once with email + password after deploy. This is expected and
  one-time.
- **Weak/short configuration**: startup must fail fast if the session secret is below the minimum
  strength or the admin email is missing in production, rather than starting in an insecure state.
- **Account enumeration**: failed sign-in must not disclose whether an email is registered.
- **Concurrent sessions / expiry**: sessions have a bounded lifetime and refresh; an expired session is
  treated as not signed in.
- **Non-admin user present**: a non-admin account (e.g. added out-of-band) can sign in but is denied
  admin-only functionality (403, not 401).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST authenticate administrators via email + password, verifying against a
  one-way **Argon2id**-hashed stored credential. Plaintext credential comparison MUST NOT exist
  anywhere in the system.
- **FR-002**: The system MUST NOT offer public self-service sign-up; account creation is invitation-only
  (accounts provisioned out-of-band).
- **FR-003**: The system MUST provision the initial administrator account automatically from configured
  admin credentials, **idempotently** (skip if the admin already exists; fail loudly if required admin
  configuration is missing).
- **FR-004**: The system MUST record an **admin** capability per account and gate admin-only endpoints
  so that requests are: **401** when unauthenticated, **403** when authenticated but not an admin, and
  successful only for admins.
- **FR-005**: Administrators MUST be able to end their session (sign out), after which protected
  endpoints reject them and the session cookie is cleared.
- **FR-006**: The system MUST persist sessions server-side with a bounded expiry and refresh behavior;
  expired sessions MUST be treated as unauthenticated.
- **FR-007**: The web sign-in experience MUST collect **email** + password and present a clear failure
  state on bad credentials, **without revealing whether an email is registered**.
- **FR-008**: The desktop application's authentication (per-translation access code) MUST remain
  unchanged and MUST NOT depend on the user-auth system; no desktop code may reference it.
- **FR-009**: The legacy hardcoded-admin authentication and signed-cookie session handling MUST be
  removed entirely (no plaintext admin credentials; the legacy `/api/users/*` endpoints removed with no
  compatibility shims).
- **FR-010**: Session cookies MUST use secure, environment-appropriate attributes (e.g. host-locked and
  secure in production).
- **FR-011**: The system MUST fail fast at startup when required auth configuration is missing or too
  weak (admin email absent in production; session secret below the minimum strength).
- **FR-012**: The authentication backend MUST own its storage through its **own isolated database
  connection/driver** and MUST NOT alter or share the domain storage layer's database driver or its
  data-access path.
- **FR-013**: Account identity uniqueness MUST be enforced on email; an account's identifier is an
  opaque string.

### Key Entities

- **Account (User)**: An authenticatable identity. Attributes: opaque string identifier, unique email,
  display name, and an **admin** capability flag.
- **Credential**: The stored authentication secret for an account's email/password method — an Argon2id
  hash, never plaintext.
- **Session**: A server-side session bound to an account, with creation time, bounded expiry, and
  refresh; the basis for "is this request authenticated".
- **Verification token**: Short-lived token storage used by the auth backend (minimal in this cut; no
  email verification or reset flows enabled).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An administrator can sign in with email + password and reach admin functions in a single
  login step (no additional setup) in under 5 seconds under normal conditions.
- **SC-002**: 100% of admin-only endpoints return 401 to anonymous requests and 403 to non-admin
  requests; none are reachable without an admin session.
- **SC-003**: 0 plaintext credentials exist in code or storage — every stored authentication secret is a
  one-way hash (verifiable by inspection).
- **SC-004**: 100% of public self-service sign-up attempts are rejected.
- **SC-005**: The desktop translation workflow completes with **zero** auth-related changes, and the
  desktop codebase contains **zero** references to the user-auth system.
- **SC-006**: Re-running provisioning produces no duplicate admin and no errors (idempotent on repeat).
- **SC-007**: All automated suites (unit, integration, web E2E, desktop E2E) pass in CI, and the domain
  storage driver and its data-access path are unchanged.
- **SC-008**: After cutover, the administrator regains access via a single email + password sign-in (no
  data loss; one-time re-login).

## Clarifications

### Session 2026-06-05

- Q: How should we treat the existing better-auth plan now that it is validated against current master?
  → A: Re-apply it, refreshed for drift and the new pre-commit/CI/constitution gates (product decisions
  not re-opened).
- Q: How do we reconcile better-auth's self-owned tables with Principle VI ("all data access MUST go
  through Persistence")? → A: Amend the constitution to scope the Persistence mandate to domain data and
  exempt server-only auth infrastructure.
- Q: How should the prerequisite Principle VI amendment be sequenced? → A: Amend the constitution now,
  inline — completed as **v1.1.0** before specification finished.
- Q: How should the auth backend talk to PostgreSQL, given the domain layer is pinned to porsager
  `postgres@1.0.2`? → A: Give the auth backend its **own isolated** driver/connection; do not touch the
  domain storage driver (supersedes the plan's Drizzle + postgres-js choice).

## Assumptions

- **Constitution prerequisite satisfied**: Principle VI was amended to v1.1.0 (domain-scoped Persistence
  - server-only auth-infra exemption) before this spec was finalized; the auth design is conformant.
- **Identity type change**: account identifiers become opaque **strings** (from the current numeric
  user id). The full ripple across core/server/frontend/desktop and test fixtures MUST land cohesively
  so the per-commit full-project typecheck stays green. _(Inventory + sequencing deferred to planning.)_
- **Operator-provided credentials**: the admin email and password are supplied via deployment secrets;
  CI, Docker, and the deploy host already place valid secrets before migrations run.
- **No invitation UI in this cut**: additional (non-admin) accounts are provisioned out-of-band; a
  self-service invitation flow is future work.
- **Cutover re-login**: legacy signed-cookie sessions are invalidated at cutover; the admin re-logs in
  once. No session migration is attempted.
- **Password policy**: a minimum password length applies to any future provisioned credentials;
  bootstrap provisioning hashes the configured admin password directly.

### Deferred to Planning (`/sp:03-plan`)

- Exact isolated auth DB adapter (e.g. `pg`/Kysely dialect) and confirmation it supports the `admin`
  field; whether any Drizzle remains.
- Mechanism to prevent auth session/verification rows (written outside the transactional test storage)
  from surviving test rollback, preserving test isolation.
- Coverage strategy for declarative/glue auth files to meet the enforced threshold (real coverage vs.
  documented coverage exclusions).
- `BETTER_AUTH_URL` / cookie-origin alignment in development (webpack vs API ports).
- Session-secret minimum-length validation and updates to sample/default secrets.

## Dependencies

- **Constitution v1.1.0** amendment (DONE — commit `a3dd2ca`).
- A new auth library plus an **auth-only** database dependency (isolated from the domain `postgres@1`
  driver).
- `secrets.json` includes an admin email wherever migrations run.

## Out of Scope

- OAuth / social login.
- Email-based password reset and email-verification flows.
- Multi-role / RBAC beyond a single boolean **admin** capability.
- Self-service invitation or user-management UI.
- Any change to desktop authentication.
- Legacy `/api/users/*` compatibility shims.
- Upgrading the **domain** PostgreSQL driver.
