# Feature Specification: User Account Management

**Feature Branch**: `006-user-account-management`
**Created**: 2026-07-02
**Status**: Draft
**Input**: User description: "user-account-management (admin roster + role change + reversible deactivate/reactivate + force-sign-out) — admin-only web/server screens to manage existing accounts; offboarding by reversible deactivate (never hard delete); builds on 001-better-auth-migration and 002-invitation-system (both merged to master)"
**Brainstorm**: specs/brainstorms/2026-07-02-user-account-management-requirements.md
**Beads Epic**: `lessons-from-luke-q8m0`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-q8m0.1`
- red-team: `lessons-from-luke-q8m0.2`
- tasks: `lessons-from-luke-q8m0.3`
- analyze: `lessons-from-luke-q8m0.4`
- implement: `lessons-from-luke-q8m0.5`
- harden: `lessons-from-luke-q8m0.6`

## Overview

The invitation system gave administrators a way to **onboard** people — issue an email-bound,
role-scoped, single-use link that creates an account. But it deliberately left out the matching
capability: **managing accounts that already exist**. Today, once an account has been created there
is **no way to see who has access, change a person's role, or revoke their access** short of running
raw SQL against the authentication data. Roles are a single Admin/Standard distinction fixed at
invitation time and never changed afterward, and there is no way to offboard someone who leaves or
whose account is compromised or shared.

This feature closes that gap. It gives an administrator an **admin-only screen that lists every
account** (the roster) and, from that surface, the ability to **change a user's role** and
**control their access** — deactivate a departing user (blocking sign-in and ending their live
sessions), reactivate them later, and force-sign-out a suspicious or shared session without
removing the account. The account roster is the surface; **access control — role changes and
offboarding — is the job.** It is the offboarding counterpart to invitation onboarding.

Offboarding is done by a **reversible deactivate, never a hard delete**: deactivated accounts stay
in the roster (marked Deactivated) for audit and can be restored, which fully cuts access while
preserving the invitation authorship (`invitedBy`) audit chain.

The participants are the **administrator** (views the roster; changes roles; deactivates,
reactivates, and force-signs-out accounts) and the **server-side authentication subsystem** (owns
the accounts and sessions and enforces every change). The **desktop application is not involved** —
it keeps its existing per-translation access-code authentication, and none of this feature's auth
infrastructure leaks into the shared, isomorphic core or the desktop path.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - View the account roster (Priority: P1)

An administrator opens the user-management screen and sees a list of **every** account, each showing
its display name, email, role (Admin or Standard), status (Active or Deactivated), and the date it
was created. Their own account is clearly marked so that consequential actions on self are visible.

**Why this priority**: This is the MVP. It is the surface every other action depends on, and it
delivers standalone value on its own — for the first time an administrator can see who has access
and with what role/status, a question that is otherwise unanswerable without direct database access.

**Independent Test**: Sign in as an administrator, open the user-management screen, and confirm the
listed accounts, roles, statuses, and created dates match the accounts that exist, with the
administrator's own row marked as self. Fully testable without any of the mutation stories.

**Acceptance Scenarios**:

1. **Given** several accounts exist with different roles and statuses, **When** an administrator
   opens the user-management screen, **Then** all accounts are listed with display name, email,
   role, status, and created date.
2. **Given** the administrator is viewing the roster, **When** they locate their own account,
   **Then** it is visually distinguished from the others as their own (self).
3. **Given** a previously deactivated account, **When** the administrator views the roster,
   **Then** that account still appears, marked as Deactivated (it is not hidden or removed).

---

### User Story 2 - Deactivate and reactivate account access (Priority: P1)

A team member leaves, or an account is compromised or shared. The administrator deactivates that
account: the user can no longer sign in, and any sessions they currently have are ended immediately.
The account is retained (shown as Deactivated) rather than deleted. Later, if the person returns or
the account is cleared, the administrator reactivates it and sign-in works again. The administrator
cannot deactivate the last remaining Admin, and cannot deactivate their own account.

**Why this priority**: This is the headline job of the feature — offboarding. It is the primary
reason the feature exists and is independently testable and valuable on its own.

**Independent Test**: Deactivate an account that has an active session; confirm the user's live
session stops being authenticated and they can no longer sign in. Reactivate it; confirm sign-in
succeeds again. Attempt to deactivate the last Admin and one's own account; confirm both are
refused.

**Acceptance Scenarios**:

1. **Given** a Standard user with an active session, **When** an administrator deactivates that
   account, **Then** the user can no longer sign in **and** their existing session is revoked
   immediately (their next request is treated as unauthenticated).
2. **Given** a deactivated account, **When** an administrator reactivates it, **Then** the user can
   sign in again.
3. **Given** the account being viewed is the only remaining Admin, **When** an administrator
   attempts to deactivate it, **Then** the action is refused with a clear explanation and no change
   is made.
4. **Given** an administrator is viewing their own account, **When** they attempt to deactivate it,
   **Then** the action is refused (self-lockout guard) and no change is made.
5. **Given** an administrator initiates a deactivation, **When** the action is consequential,
   **Then** they must pass an explicit confirmation step before it takes effect.

---

### User Story 3 - Change a user's role (Priority: P2)

An administrator promotes a Standard user to Admin (for example, to share administrative duties) or
demotes an Admin back to Standard. The system refuses to demote the last remaining Admin, so there
is never a path to zero administrators.

**Why this priority**: Role management is core access control, but it is secondary to being able to
see the roster and to offboard people. It builds on the same roster surface and is independently
testable.

**Independent Test**: Promote a Standard user and confirm they gain administrative access; demote
them and confirm the access is removed. Attempt to demote the last Admin and confirm it is refused.

**Acceptance Scenarios**:

1. **Given** a Standard user, **When** an administrator promotes them, **Then** the account becomes
   an Admin and gains administrative access.
2. **Given** an Admin (with at least one other Admin present), **When** an administrator demotes
   them, **Then** the account becomes Standard and no longer has administrative access.
3. **Given** the account is the only remaining Admin, **When** an administrator attempts to demote
   it, **Then** the action is refused with a clear explanation and no change is made.
4. **Given** an administrator initiates a demotion, **When** the action is consequential, **Then**
   they must pass an explicit confirmation step before it takes effect.

---

### User Story 4 - Force sign-out without deactivating (Priority: P3)

An administrator suspects a session is shared or compromised but does not want to offboard the
account. They force a sign-out: the user's active sessions are ended immediately, but the account
stays Active and the user can sign back in.

**Why this priority**: A secondary convenience that reuses the session-revocation capability already
needed for deactivation. Valuable for shared or suspicious logins, but not essential to the core
onboarding-counterpart job.

**Independent Test**: With a user holding an active session, force-sign-out that user; confirm the
session ends immediately and the account remains Active, then confirm the user can sign in again.

**Acceptance Scenarios**:

1. **Given** a user with an active session, **When** an administrator forces a sign-out, **Then**
   the user's active sessions are revoked immediately and the account remains Active.
2. **Given** a user who was just force-signed-out, **When** they sign in again, **Then** sign-in
   succeeds (the account was not deactivated).
3. **Given** an administrator initiates a force sign-out, **When** the action is consequential,
   **Then** they must pass an explicit confirmation step before it takes effect.

---

### Edge Cases

- **Last-admin guardrail under concurrency**: If two administrators (or two requests) attempt to
  demote or deactivate the two remaining Admins at the same time, the system MUST NOT allow both to
  succeed and reach zero Admins — at least one must be refused.
- **Self-action on the roster**: An administrator attempting to deactivate their own account is
  refused; demoting oneself is permitted only while at least one other Admin remains (otherwise it
  is a last-admin demotion and refused).
- **Acting on an already-deactivated account**: Deactivating an already-deactivated account, or
  reactivating an already-active one, is a no-op that does not error confusingly and leaves the
  account in the expected final state.
- **Force sign-out / deactivate with no active sessions**: Revoking sessions for a user who has none
  succeeds without error (nothing to revoke).
- **A user acting during their own deactivation**: When an account is deactivated, any request that
  account makes afterward — including one already in flight — is treated as unauthenticated on its
  next evaluation.
- **Empty or single-account roster**: The roster renders correctly when only the seeded
  administrator exists (single self row, no actionable targets).
- **Non-admin or logged-out access**: A logged-out visitor to any user-management screen or endpoint
  receives an unauthenticated response (401); a signed-in Standard user receives a forbidden
  response (403); neither sees roster data.

## Requirements _(mandatory)_

### Functional Requirements

**Roster (view)**

- **FR-001**: The system MUST provide an administrator-only capability to view a list of **all** user
  accounts, each showing display name, email, role (Admin / Standard), status (Active / Deactivated),
  and created date.
- **FR-002**: The roster MUST visually distinguish the requesting administrator's **own** account
  (self) from the others.

**Role management**

- **FR-003**: An administrator MUST be able to **promote** a Standard user to Admin and **demote** an
  Admin to Standard.
- **FR-004**: The system MUST **prevent demoting the last remaining Admin**, so there is never a path
  to zero administrators.

**Access control (offboarding)**

- **FR-005**: An administrator MUST be able to **deactivate** an account. A deactivated user MUST be
  unable to sign in, and their active sessions MUST be **revoked immediately**.
- **FR-006**: An administrator MUST be able to **reactivate** a deactivated account, restoring the
  user's ability to sign in.
- **FR-007**: Deactivated accounts MUST **remain in the roster** (shown as Deactivated) for audit;
  accounts MUST NOT be hard-deleted by this feature.
- **FR-008**: The system MUST **prevent deactivating the last remaining Admin** and MUST **prevent an
  administrator from deactivating their own account** (self-lockout guard).

**Force sign-out**

- **FR-009**: An administrator MUST be able to **revoke a user's active sessions without
  deactivating** the account, forcing that user to sign in again while the account stays Active.

**Safety & consistency**

- **FR-010**: All user-management endpoints and screens MUST be **administrator-only**: an
  unauthenticated request MUST receive a 401 and an authenticated non-administrator MUST receive a
  403, consistent with the existing admin namespace. Mutating requests MUST enforce **same-origin**,
  matching the invitation controller.
- **FR-011**: Consequential actions (demote, deactivate, revoke sessions) MUST require an explicit
  **confirmation step** before they take effect, consistent with the invitation "Retract" two-step
  confirm.
- **FR-012**: The structural guardrails (never zero Admins; no self-deactivation) MUST be enforced
  **server-side**, not only in the interface, and MUST hold under **concurrent** requests so no race
  can leave the system with zero Admins.
- **FR-013**: A role change MUST take effect for the affected account — a demoted user MUST lose
  administrative access and a promoted user MUST gain it. Whether an already-active session reflects
  the change immediately (via session revocation/refresh) or on next sign-in is a planning decision
  (see Assumptions); either way the change MUST become effective and MUST NOT be silently lost.
- **FR-014**: User-management UI and endpoints MUST remain **web/server-only**. The desktop client,
  its access-code authentication, and the isomorphic `core` layer MUST remain untouched, and the
  isolated authentication infrastructure MUST NOT leak into `core` or the desktop path (constitution
  Principle VI server-only exemption; the domain data driver stays untouched).

### Key Entities _(include if feature involves data)_

- **User Account**: A person's web login. Attributes: display name, email (its unique identity),
  **role** (Admin or Standard), **status** (Active or Deactivated — new persisted state introduced by
  this feature), and created date. An account may be the author of one or more invitations (the
  `invitedBy` audit relationship that must be preserved) and may hold zero or more active sessions.
- **Role**: The Admin/Standard distinction carried by an account; the mechanism by which an account
  is granted or denied administrative capabilities. Toggled by promote/demote.
- **Account status**: The Active/Deactivated distinction; a separate state from role that governs
  whether the account may sign in. Deactivated is reversible.
- **Session**: An authenticated login instance belonging to a User Account. Revoked immediately when
  the account is deactivated or force-signed-out; keyed to the account so revocation ends all of that
  account's sessions.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An administrator opening the user-management screen sees **100% of existing accounts**,
  each with its correct role and status.
- **SC-002**: An administrator can promote a Standard user to Admin and demote them back; a demotion
  that would remove the last Admin is **refused with a clear message** in 100% of attempts.
- **SC-003**: When an administrator deactivates an account, the affected user's active sessions end
  **immediately** (their next request is unauthenticated) and they **cannot sign in** until the
  account is reactivated.
- **SC-004**: After reactivation, the same user can **sign in again successfully**.
- **SC-005**: Every attempt to deactivate or demote the **last Admin**, or for an administrator to
  deactivate **their own** account, is refused with a clear message — in 100% of attempts, including
  concurrent ones (the system never reaches zero Admins).
- **SC-006**: Every user-management route returns **401 when unauthenticated** and **403 for a
  non-administrator**; no route exposes roster data or mutation to a Standard user.
- **SC-007**: An administrator can **force-sign-out** a user; that user's sessions end immediately,
  the account remains Active, and the user can sign back in.
- **SC-008**: The **desktop application and the domain data storage are unchanged** — desktop
  access-code authentication and translation flows behave exactly as before, and full CI is green.

## Assumptions

- **Scale**: This is a small translation-team tool; the roster is expected to hold on the order of
  tens of accounts, so no pagination, search, or sorting is required for v1 (the roster shows all
  accounts at once). If ordering is applied, a stable order such as by created date is a reasonable
  default.
- **Role model**: The existing Admin/Standard `admin` boolean remains the role model; this feature
  does **not** adopt an alternate multi-role scheme. Deactivation is a **separate new state** from
  role, not a role value.
- **Offboarding primitive**: Offboarding is a reversible **deactivate**, chosen over hard delete
  because deleting an account that authored invitations would violate the preserved `invitedBy` audit
  relationship, and because deactivate fully cuts access (blocks sign-in + ends sessions) while
  remaining reversible and auditable.
- **Confirmation UX**: The explicit confirmation step for consequential actions follows the existing
  invitation "Retract" two-step confirm pattern rather than introducing a new confirmation style.
- **Surface**: User management is a **separate administrator screen** alongside the existing
  invitations screen (consistency over novelty), not a restructured/combined "People" area.
- **Stacking**: Dependencies 001-better-auth-migration and 002-invitation-system are **merged to
  master**, so this branch bases on `master` rather than being stacked on an unmerged auth branch.

### Deferred to Planning _(technical, carried from brainstorm — for `/sp:03-plan`)_

- **Deactivation state & enforcement point**: The exact persisted representation of deactivation and
  precisely where sign-in and session-load are made to reject a deactivated account.
- **Role-change propagation to active sessions**: Whether a promotion/demotion takes effect
  immediately (revoke + refresh the affected session) or on the user's next sign-in (relates to
  FR-013).
- **Endpoint strategy**: Whether to enable the authentication library's admin plugin (present but
  unconfigured; would bring list/ban/set-role/revoke-sessions helpers, but its role/banned model
  likely conflicts with the existing `admin` boolean) or hand-roll the endpoints for consistency.
- **Last-admin guard mechanism**: Implementing the guard as a transactional count so two concurrent
  demotions/deactivations cannot both pass the check (relates to FR-004, FR-008, FR-012).
- **Test isolation**: Ensuring user-mutation tests respect the existing per-test cleanup that deletes
  all users except the seeded administrator, including resetting any new deactivation state between
  tests.
- **Frontend data path**: Whether the roster/actions use the invitation precedent (async thunk +
  fetch) or the languages/lessons precedent (request context + Redux slice).

## Dependencies

- Builds directly on **001-better-auth-migration** and **002-invitation-system** (both merged to
  master): the account and session tables, the isolated authentication connection, the
  administrator-only middleware, and the Admin/Standard `admin` boolean.
- Session revocation depends on sessions being server-side and keyed to the account, so that ending
  an account's sessions is a direct operation.
- Deactivation introduces **new persisted account state** and a new enforcement point in the sign-in
  / session-load path; a valid secrets configuration must remain present wherever migrations run
  (CI, containerized dev, and deploy).

## Out of Scope

- **Hard-deleting accounts** — offboarding is a reversible deactivate; accounts are never removed by
  this feature.
- **Administrator-initiated password reset** — would require a token/link flow and email sending that
  does not exist; the practical need is covered by deactivate + re-invite. Future work.
- **Editing another user's name or email** from this screen.
- **A unified "People" area** merging the invitations and users screens — v1 keeps a separate sibling
  screen; unifying is possible future work.
- **Bulk actions, CSV import/export, email notifications, OAuth, and impersonation.**
- **Any change to desktop authentication** or to the isomorphic core / domain data driver.

## Clarifications

### Session 2026-07-02

- Q: Use the ratified brainstorm (`specs/brainstorms/2026-07-02-user-account-management-requirements.md`) as the basis for this specification? → A: Yes — build the spec from its requirements (R1–R12), success criteria, and scope boundaries.
- Q: The brainstorm marks "Force sign-out" (revoke a user's active sessions without deactivating the account) as optional/SHOULD. Include it in v1 scope? → A: Yes — include it as a P3 user story (User Story 4 / FR-009); it reuses the session-revocation primitive that deactivation already requires.
