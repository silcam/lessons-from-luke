# Feature Specification: Invitation System

**Feature Branch**: `002-invitation-system`
**Created**: 2026-06-17
**Status**: Draft
**Input**: User description: "invitation-system (admin-issued single-use, email-bound sign-up links with an admin management screen) — branch stacked off 001-better-auth-migration"
**Brainstorm**: specs/brainstorms/2026-06-17-invitation-system-requirements.md
**Beads Epic**: `lessons-from-luke-9c7`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-9c7.1`
- red-team: `lessons-from-luke-9c7.2`
- tasks: `lessons-from-luke-9c7.3`
- analyze: `lessons-from-luke-9c7.4`
- implement: `lessons-from-luke-9c7.5`
- harden: `lessons-from-luke-9c7.6`

## Overview

The application currently allows account creation by invitation only, but offers **no
invitation flow**: public sign-up is globally disabled and the single seeded administrator
is the only account. Any additional account must be provisioned out-of-band, directly against
the authentication data. This feature gives an administrator a self-service way to onboard
people.

An administrator creates a **single-use, email-bound invitation**, chooses the role it grants,
and copies its **link**. Because the system has **no email-sending capability**, the
administrator pastes the link into an email they send themselves. The recipient opens the link,
sets a password and display name, and an account is created with the role the administrator
chose. A second, administrator-only screen lets administrators see and manage outstanding
invitations.

The participants are the **administrator** (creates and manages invitations), the **recipient**
(redeems a link to create their account), and the **server-side authentication subsystem**
(issues and validates single-use links and creates the account despite public sign-up being
disabled). The desktop application is **not involved** — it keeps its existing per-translation
access-code authentication.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Issue an invitation (Priority: P1)

An administrator needs to onboard a new person. From the administrator area they create an
invitation by entering the recipient's email address and choosing the role to grant
(administrator or standard). The system produces a copy-pasteable link, which the administrator
copies and pastes into an email they send to the recipient out-of-band.

**Why this priority**: Without the ability to mint an invitation link, no one but the seeded
administrator can ever get an account. This is the entry point of the whole feature.

**Independent Test**: Sign in as an administrator, create an invitation for a brand-new email
with a chosen role, and confirm a working link is produced and can be copied. Confirm the
system rejects an email that already has an account and rejects a second invitation for an
email that already has an active one.

**Acceptance Scenarios**:

1. **Given** an administrator is signed in, **When** they create an invitation for a new email
   address and select the "standard" role, **Then** the invitation is recorded as Pending and a
   copy-pasteable link is shown.
2. **Given** an administrator is signed in, **When** they create an invitation and select the
   "administrator" role, **Then** the invitation is recorded as Pending granting the
   administrator role.
3. **Given** an email address that already has an account, **When** an administrator tries to
   create an invitation for it, **Then** creation is rejected with a clear message and no
   invitation is recorded.
4. **Given** an email already has an active (Pending, non-expired) invitation, **When** an
   administrator tries to create a second invitation for it, **Then** creation is rejected with a
   clear message.
5. **Given** an email's prior invitation has expired or been retracted (and no account exists),
   **When** an administrator creates a new invitation for it, **Then** creation succeeds.

---

### User Story 2 - Redeem an invitation (Priority: P1)

A recipient receives the link and opens it. They see a sign-up form with their email already
filled in and locked. They set a password and a display name, and an account is created with the
role chosen by the administrator. They are then directed to sign in with their new credentials.

**Why this priority**: Issuing a link has no value unless a recipient can redeem it into a real,
correctly-scoped account. Together with User Story 1 this forms the minimum viable feature.

**Independent Test**: Given a Pending invitation, open its link, confirm the email is pre-filled
and not editable, set a password and display name, and confirm an account is created with the
invitation's role and the recipient is sent to sign in. Then confirm the same link cannot create
a second account, and that an unknown/expired/retracted link is rejected without leaking detail.

**Acceptance Scenarios**:

1. **Given** a valid Pending invitation link, **When** the recipient opens it, **Then** a sign-up
   form is shown with the bound email pre-filled and not editable.
2. **Given** the recipient is on a valid sign-up form, **When** they set a password and display
   name and submit, **Then** an account is created with the role specified on the invitation, the
   invitation becomes Accepted, and the recipient is directed to the sign-in page.
3. **Given** an invitation that is already Accepted, **When** its link is opened again, **Then** a
   clear "no longer valid" message is shown and no account can be created.
4. **Given** an unknown, retracted, or expired link, **When** it is opened, **Then** a clear,
   non-leaky message is shown and account creation is not allowed.
5. **Given** public self-service sign-up is disabled, **When** a recipient redeems a valid
   invitation, **Then** account creation still succeeds.

---

### User Story 3 - Manage outstanding invitations (Priority: P2)

An administrator opens a management screen to review every invitation and its current state.
For Pending invitations they can re-copy the link (in case the original copy was lost) or retract
it (immediately killing the link). Accepted, Expired, and Retracted invitations remain visible
for history.

**Why this priority**: Administrators need visibility and control after issuance — to recover a
lost link without re-issuing, to revoke an invitation that should no longer be redeemable, and to
audit who was invited, with which role, and by whom. Valuable, but the feature can ship and be
demonstrated end-to-end (issue + redeem) before this screen exists.

**Independent Test**: With a mix of Pending, Accepted, Expired, and Retracted invitations, open
the management screen and confirm each shows the correct email, role, status, creation date,
acceptance date (when Accepted), and creating administrator. Re-copy a Pending link and confirm it
matches the original; retract a Pending invitation and confirm its link stops working immediately.

**Acceptance Scenarios**:

1. **Given** several invitations in different states, **When** an administrator opens the
   management screen, **Then** each invitation shows recipient email, granted role, status,
   creation date, acceptance date (for Accepted), and the administrator who created it.
2. **Given** a Pending invitation, **When** an administrator re-copies its link, **Then** the same
   working link is provided again.
3. **Given** a Pending invitation, **When** an administrator retracts it, **Then** its status
   becomes Retracted and its link stops working immediately.
4. **Given** an Accepted, Expired, or Retracted invitation, **When** an administrator views the
   list, **Then** it remains listed for history and offers no redemption.

---

### Edge Cases

- **Retraction during redemption**: a recipient has a valid form open and the administrator
  retracts the invitation before submission — submission is rejected and treated as an invalid
  link; no account is created.
- **Expiry during redemption**: the 14-day window elapses while a form is open — submission is
  rejected as expired.
- **Concurrent/double redemption**: two submissions race on the same valid link — at most one
  account is created; the other is rejected by the single-use rule.
- **Already-signed-in visitor opens a link**: the redemption flow operates on the bound email of
  the invitation, not on whoever is currently signed in; it never grants the invitation to an
  unrelated signed-in user.
- **Malformed email at creation**: creating an invitation for a malformed email address is
  rejected with a validation message.
- **Empty management list**: when no invitations exist, the management screen shows an empty
  state rather than an error.
- **Re-inviting an email**: blocked while an active invitation exists; allowed once the prior one
  is Expired or Retracted and no account exists.

## Requirements _(mandatory)_

### Functional Requirements

**Invitation creation (administrator-only)**

- **FR-001**: Administrators MUST be able to create a single-use invitation bound to a specific
  recipient email address.
- **FR-002**: When creating an invitation, the administrator MUST choose the role it grants:
  **administrator** or **standard (non-administrator)**.
- **FR-003**: Creating an invitation MUST produce a copy-pasteable invitation link (a URL into the
  web application). The system MUST NOT send any email itself.
- **FR-004**: The system MUST reject creating an invitation for an email address that already has
  an account, with a clear message, and MUST NOT record an invitation.
- **FR-005**: The system MUST permit at most one active (Pending, non-expired) invitation per
  email address at a time; a second creation attempt while one is active MUST be rejected with a
  clear message.
- **FR-006**: The system MUST permit creating a new invitation for an email whose prior invitation
  is Expired or Retracted, provided no account exists for that email.

**Invitation redemption (recipient)**

- **FR-007**: Opening a valid (Pending, non-expired) invitation link MUST present a sign-up form
  with the bound email pre-filled and **not editable**.
- **FR-008**: To complete redemption, the recipient MUST set a **password** and a **display name**;
  the account MUST be created with the role specified on the invitation.
- **FR-009**: An invitation MUST be **single-use** — once Accepted it MUST never be redeemable
  again.
- **FR-010**: Opening an invalid link (unknown, already Accepted, Retracted, or Expired) MUST show
  a clear, non-leaky message and MUST NOT allow account creation.
- **FR-011**: Account creation via a valid invitation MUST succeed even though public self-service
  sign-up remains globally disabled.
- **FR-012**: After successful redemption, the recipient MUST be directed to the sign-in page to
  log in with their new credentials; redemption MUST NOT automatically establish a signed-in
  session.

**Invitation management (administrator-only)**

- **FR-013**: Administrators MUST be able to view a list of all invitations showing recipient
  email, granted role, status, creation date, and (for Accepted invitations) acceptance date.
- **FR-014**: Each invitation's status MUST be exactly one of **Pending**, **Accepted**,
  **Expired**, or **Retracted**.
- **FR-015**: Administrators MUST be able to **retract** a Pending invitation; retraction MUST
  immediately invalidate its link.
- **FR-016**: For a Pending invitation, administrators MUST be able to **re-copy its link** so a
  lost link does not force re-issuing the invitation.
- **FR-017**: Each invitation MUST record **which administrator created it**, for audit, since
  invitations can grant the administrator role and multiple administrators may exist.

**Lifecycle & expiry**

- **FR-018**: A Pending invitation MUST **expire 14 days after creation** (default; configurable
  system-wide). Expired invitations MUST display as Expired and their links MUST no longer work.
- **FR-019**: Retracted and Expired invitations MUST be **retained** in the list for audit/history
  (soft terminal state, not hard-deleted).

**Access control & isolation**

- **FR-020**: All invitation creation and management capabilities MUST be **administrator-only**:
  unauthenticated access MUST return 401 and authenticated non-administrator access MUST return
  403, consistent with the existing administrator-only area.
- **FR-021**: The invitation feature MUST be **web/server-only**; the desktop application MUST
  remain unchanged and continue using per-translation access-code authentication.
- **FR-022**: Invitation records MUST be owned by the **server-side authentication subsystem** and
  MUST NOT leak into the shared cross-platform code or the desktop application's data path.

### Key Entities _(include if feature involves data)_

- **Invitation**: An administrator-issued, single-use authorization to create one account. Key
  attributes: bound recipient email address, granted role (administrator or standard), status
  (Pending / Accepted / Expired / Retracted), creation date, expiry date, acceptance date (when
  Accepted), the administrator who created it, and a secret link/token by which a recipient
  redeems it. Only Pending, non-expired invitations have a working link; Accepted, Retracted, and
  Expired are terminal and retained for history.
- **Account / User** (existing): The credential a recipient ends up with after redemption,
  carrying the role granted by the invitation. Each email address maps to at most one account.
- **Administrator** (existing): A signed-in user with the administrator role; the only actor who
  may create, list, retract, or re-copy invitations.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An administrator can create an email-bound, role-scoped, single-use invitation and
  obtain a shareable link in under 1 minute without leaving the administrator area.
- **SC-002**: A recipient can go from opening a valid link to a created account (then directed to
  sign in) in under 2 minutes, with the bound email shown but not editable.
- **SC-003**: 100% of attempts to reuse an Accepted invitation link are rejected (no second
  account is ever created from one invitation).
- **SC-004**: Retracting a Pending invitation invalidates its link immediately — the next use of
  that link fails.
- **SC-005**: The management list reflects each invitation's status (Pending / Accepted / Expired /
  Retracted) with creation date, acceptance date (when Accepted), and creating administrator with
  100% accuracy across all state transitions.
- **SC-006**: A Pending invitation's link stops working once 14 days have elapsed since its
  creation, and shows as Expired thereafter.
- **SC-007**: 100% of invitation creation and management actions are blocked for unauthenticated
  users (401) and for authenticated non-administrators (403).
- **SC-008**: Public self-service sign-up remains disabled; only valid invitations (and the seeded
  administrator) result in new accounts.
- **SC-009**: The desktop application's behavior is unchanged (no regression) and the shared
  cross-platform code is unaffected.

## Assumptions

- **Localization**: New recipient-facing and administrator-facing screens follow the existing
  web application's translation conventions (keyed strings, English plus French today). New
  strings are added as keys; full French copy may be filled in later.
- **Display name**: The recipient supplies their own display name during redemption (it is not set
  by the administrator at creation time).
- **Expiry tuning**: The 14-day expiry is a single system-wide default, not chosen per invitation;
  administrators do not pick a custom expiry when creating an invitation.
- **Re-copy returns the original link**: re-copying a Pending invitation yields the same working
  link rather than rotating it.
- **Retract is the only Pending action besides re-copy**: there is no edit-in-place of a Pending
  invitation's email or role; to change either, retract and re-create.
- **Standard role scope**: Granting the "standard" role assigns a non-administrator account; what
  a standard account can do in the web application is pre-existing behavior outside this feature's
  scope (this feature only assigns the role).
- **Audit retention**: Accepted, Retracted, and Expired invitations are retained indefinitely;
  no purge/cleanup of historical invitations is in scope.

### Deferred to Planning _(technical, carried from brainstorm — for `/sp:03-plan`)_

- **Account creation while public sign-up is disabled (affects FR-011)**: how an account is
  created for a valid invitation while public self-service sign-up stays globally off — e.g. a
  server-side accept-invitation path that creates the account directly (mirroring the existing
  admin seed), an administrative create-user capability, or a token-scoped sign-up path. Whichever
  is chosen must keep password hashing consistent with the existing authentication subsystem.
- **Link/token design (affects FR-001, FR-009, FR-018)**: token generation, storing only a hash of
  the token rather than plaintext, single-use and expiry enforcement at lookup, and the new
  invitation table schema and indexes.
- **Test isolation (affects FR-014, FR-018)**: invitation rows written outside the transactional
  test storage must be cleaned up after each test, like the existing session/verification/rate-limit
  cleanup.
- **Account-creation field requirements (affects FR-008)**: confirm exactly what the authentication
  subsystem requires at account creation (e.g. the name field) and finalize how the display name is
  collected and stored.
- **Duplicate-pending rule mechanics (affects FR-005, FR-006)**: the exact enforcement of the
  one-active-invitation rule and how it interacts with re-inviting an email whose prior invitation
  expired or was retracted.

## Dependencies

- **Stacked on `001-better-auth-migration`** (not yet merged to `master`): this feature builds
  directly on the authentication migration — the administrator role, the administrator-only access
  guard, and the isolated authentication data connection. The `002-invitation-system` branch is
  created off `001`.
- A new **authentication-owned invitation table** follows the existing authentication migration
  pattern and lives on the isolated authentication data connection; the domain data driver is
  untouched.
- The configured application origin (already present as `BETTER_AUTH_URL`) provides the base for
  building invitation links.
- A valid `secrets.json` continues to be present wherever migrations run (CI, Docker, deploy).

## Out of Scope

- **No email sending** — the link is copy-paste only.
- **No management of existing accounts** (deactivate, remove, or change the role of an account that
  already exists) — invitations only; account management is future work.
- No OAuth, no public self-service sign-up, no password reset.
- No bulk/CSV invitations, no resend-by-email, no invitation quotas, and no rate limits beyond what
  the authentication subsystem already applies.
- No desktop authentication changes.

## Clarifications

### Session 2026-06-17

- Q: After a recipient opens a valid invitation link and sets their password + display name, what
  should happen immediately? → A: Account is created but the recipient is **redirected to the
  sign-in page** to log in with their new email + password; no automatic session is established.
- Q: Use the brainstorm at `specs/brainstorms/2026-06-17-invitation-system-requirements.md` as the
  basis for this specification? → A: Yes (the feature description explicitly references it); product
  and scope decisions in that document are treated as resolved, and its "Deferred to Planning" items
  are carried into the Assumptions section above for `/sp:03-plan`.
- Q: How should the new recipient-facing and administrator-facing screens handle localization? → A:
  Follow the existing keyed-string translation convention (resolved against the existing web auth
  UI, which is already keyed for English and French); recorded as an assumption rather than a
  blocking decision.
