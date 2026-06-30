# Feature Specification: Transactional Email & Self-Service Password Reset

**Feature Branch**: `005-transactional-email-reset`
**Created**: 2026-06-30
**Status**: Draft
**Input**: User description: "Transactional email via Mailgun + self-service password reset and auto-emailed invitations"
**Brainstorm**: specs/brainstorms/2026-06-29-transactional-email-and-password-reset-requirements.md
**Beads Epic**: `lessons-from-luke-5qjl`
**Beads Phase Tasks**:

- plan: `lessons-from-luke-5qjl.1`
- red-team: `lessons-from-luke-5qjl.2`
- tasks: `lessons-from-luke-5qjl.3`
- analyze: `lessons-from-luke-5qjl.4`
- implement: `lessons-from-luke-5qjl.5`
- harden: `lessons-from-luke-5qjl.6`

## Overview

The application has **no transactional email today**. Two consequences follow. First, a web
user who forgets their password has **no way to recover** — public sign-up is disabled and
accounts are administrator-issued, so a locked-out user depends on out-of-band administrator
intervention. Second, when an administrator creates an **invitation**, the link is shown in a
copy box and the administrator must **send it by hand** through some other channel.

This feature introduces a single **server-side email capability** and uses it for two
user-facing flows: a **self-service password reset** for end users, and **automatic delivery
of invitation links** to invitees. The same email capability serves both, so adding invitation
delivery costs little once email exists.

The participants are the **end user** (requests and completes a password reset), the
**administrator** (creates invitations, which are now emailed automatically, and can resend
them), the **invitee** (receives the invitation by email), and the **server-side
authentication and email subsystem** (sends mail, issues and validates single-use reset and
invitation links). The **desktop application is not involved** — it keeps its existing
per-translation access-code authentication and never sends email.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Reset a forgotten password (Priority: P1)

A web user who has forgotten their password opens the sign-in screen, follows a "Forgot
password?" entry point, and submits their email. If an account exists, a single-use,
time-limited reset link is sent to that address. Opening the link lets them set a new password,
after which they sign in normally. No administrator is involved at any point.

**Why this priority**: This is the headline capability and the brand-new value. Without it a
locked-out user has no self-service path back into the product. It is the MVP of this feature.

**Independent Test**: From a signed-out state, request a reset for a known account, obtain the
link (from email in production, from logs in dev/test), set a new password, and sign in with
it. Confirm the old password no longer works and other sessions are signed out. Confirm an
unknown email produces the same generic response with no email sent.

**Acceptance Scenarios**:

1. **Given** a signed-out user with an existing account, **When** they submit their email at
   "Forgot password?", **Then** a single-use, time-limited reset link is sent to that email and
   a generic "check your email" confirmation is shown.
2. **Given** an email address with no account, **When** it is submitted at "Forgot password?",
   **Then** no email is sent but the **same** generic confirmation is shown, with no indication
   that the account is missing.
3. **Given** a valid, unused reset link, **When** the user opens it and sets a new password
   meeting the policy, **Then** the password is updated and they can sign in with it.
4. **Given** a user has just completed a reset, **When** the reset succeeds, **Then** all other
   active sessions for that account are signed out.
5. **Given** a reset link that has already been used or has expired, **When** the user opens it,
   **Then** it is rejected with a clear message and an option to request a new link.
6. **Given** a new password that violates the policy (e.g. fewer than 12 characters), **When**
   the user submits it, **Then** it is rejected with guidance and the password is unchanged.

---

### User Story 2 - Receive an invitation by email (Priority: P2)

An administrator creates an invitation for a new person. The system automatically emails the
invitation link to that address. The administrator still sees the copyable link and can resend
the email for any pending invitation. The invitee opens the link from their inbox and completes
account creation as before.

**Why this priority**: This removes a real manual step that exists today (copy the link, send
it by hand). It is high value but ranks below the brand-new self-service capability because the
invitation system already functions without it.

**Independent Test**: As an administrator, create an invitation for a new email; confirm the
invitation email is sent (delivered in production, logged in dev/test) containing the working
link, and that the link is also shown in the interface. Trigger "Resend email" on the pending
invitation and confirm another send. Confirm the invitation is still created and the link still
shown when sending fails.

**Acceptance Scenarios**:

1. **Given** an administrator creates an invitation for a new email, **When** the invitation is
   recorded, **Then** the invitation link is automatically emailed to that address and the same
   link is shown in the administrator interface.
2. **Given** a pending invitation, **When** the administrator chooses "Resend email", **Then**
   the invitation link is emailed again to the bound address.
3. **Given** an invitation whose automatic email failed to send, **When** the administrator
   views it, **Then** the invitation still exists, the link is still available to copy, and the
   administrator is informed the email could not be sent.
4. **Given** an invitation that is accepted, expired, or retracted, **When** the administrator
   views it, **Then** the "Resend email" action is not available.
5. **Given** an invitee receives the invitation email, **When** they open the link and complete
   account creation, **Then** their account is created exactly as it is today.

---

### User Story 3 - Safe, environment-aware email delivery (Priority: P3)

Operators and developers need confidence that production never silently fails to send mail, and
that development and CI can exercise the email flows without a live provider. In production the
application refuses to start unless email delivery is properly configured; in development and
test, emails and their links are written to logs instead of being transmitted.

**Why this priority**: This is an operational safety and enablement concern rather than an
end-user journey, but it is required for the other two stories to be both safe in production and
testable locally.

**Independent Test**: Start the application in production mode with missing or default email
configuration and confirm it refuses to start with a clear error; configure it correctly and
confirm it starts. In development/test, trigger a reset or invitation and confirm the rendered
email and its link appear in logs and no external email is sent.

**Acceptance Scenarios**:

1. **Given** production mode with missing or default email configuration, **When** the server
   starts, **Then** it fails fast with a clear error naming the missing configuration, without
   printing any secret values.
2. **Given** production mode with valid email configuration, **When** the server starts,
   **Then** it starts normally.
3. **Given** development or test mode, **When** any flow sends an email, **Then** the rendered
   email and its link are written to logs and no external email is transmitted.

---

### Edge Cases

- **Provider unreachable at send time**: If the email provider errors or is unreachable when
  sending, a password reset still shows the standard generic confirmation (the failure is
  logged for operators), and an invitation is still created with its link available while the
  administrator is told the email could not be sent.
- **Reset request flooding**: Repeated password-reset requests for the same address (or from the
  same origin) are throttled to limit email flooding and provider-quota abuse.
- **Superseded reset link**: If a newer reset request is made, an older still-unused link is
  treated as no longer valid and rejected.
- **Repeated resend**: Resending an invitation re-sends the same still-valid link; it does not
  alter the invitation's existing expiry.
- **Desktop accounts**: Password reset does not apply to the desktop access-code authentication,
  which is unaffected.

## Requirements _(mandatory)_

### Functional Requirements

**Transactional Email Foundation**

- **FR-001**: The system MUST provide a server-only transactional email capability usable by
  any server-side flow that needs to send mail. It MUST NOT be reachable from the isomorphic
  core or the desktop offline path.
- **FR-002**: In production, the system MUST refuse to start (fail fast) if email-delivery
  configuration is missing or left at default values, consistent with existing startup secret
  validation.
- **FR-003**: In development and test environments, the system MUST record (log) the fully
  rendered email — including any action links — instead of transmitting it, so links remain
  recoverable without a live email provider.
- **FR-004**: Email-delivery configuration MUST be stored alongside existing secrets and
  validated at startup; secret values MUST never be logged (field names only).

**Self-Service Password Reset**

- **FR-005**: A signed-out web user MUST be able to request a password reset from a "Forgot
  password?" entry point on the sign-in screen by submitting their email address.
- **FR-006**: The system MUST send a single-use, time-limited password-reset link to the
  submitted address only if an account exists for it.
- **FR-007**: The response shown to the requester MUST be identical whether or not the email is
  registered (no account enumeration).
- **FR-008**: Following a valid, unused reset link, the user MUST be able to set a new password
  subject to the existing password policy (12–128 characters).
- **FR-009**: After a successful password reset, the user MUST be able to sign in with the new
  password, and the system MUST invalidate all other active sessions for that account.
- **FR-010**: The system MUST reject an already-used or expired reset link with a clear message
  and a path to request a new link.
- **FR-011**: Password reset MUST be available to every web account that authenticates by email
  and password, including administrators.
- **FR-012**: The system MUST throttle repeated password-reset requests to limit abuse (e.g.
  email flooding), consistent with existing authentication rate limiting.
- **FR-013**: If sending a password-reset email fails at request time, the system MUST still
  return the standard generic response to the requester and MUST record the failure server-side
  for operators.

**Invitation Auto-Delivery**

- **FR-014**: When an administrator creates an invitation, the system MUST automatically send
  the invitation link to the invitee's email address using the shared email capability.
- **FR-015**: The administrator invitation interface MUST continue to display the
  copy-pasteable invitation link after creation.
- **FR-016**: The administrator MUST be able to resend the invitation email for any **pending**
  invitation (not yet accepted, expired, or retracted).
- **FR-017**: If automatic sending of an invitation email fails, the invitation MUST still be
  created and its link MUST remain available (copy and resend), and the failure MUST be surfaced
  to the administrator without blocking invitation creation.
- **FR-018**: Invitation emails MUST respect the same environment-gating as all other email
  (FR-002, FR-003).

### Key Entities _(include if feature involves data)_

- **Transactional email**: A message the server sends to a single recipient — recipient address,
  subject, body, an embedded action link, and a delivery outcome (sent / logged / failed). Not
  necessarily persisted.
- **Password-reset link**: A single-use, time-limited credential bound to one account that
  authorizes setting a new password. Issued and validated by the authentication subsystem.
- **Invitation** (existing): An email-bound, single-use onboarding link with a status (pending,
  accepted, expired, retracted) and an expiry. This feature adds automatic email delivery and a
  resend action; the invitation's data and lifecycle are otherwise unchanged.
- **Email-delivery configuration**: The provider credentials, sending domain, and from-address
  that determine whether and how email is transmitted, and that gate startup in production.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A web user who has forgotten their password can regain access end-to-end (request
  → email → set new password → sign in) with **zero** administrator involvement.
- **SC-002**: An administrator can onboard a new user without manually copying or sending a
  link — the invitee receives the invitation by email, with copy-link and resend available as
  fallbacks.
- **SC-003**: In production the application will not start when email delivery is unconfigured or
  misconfigured; in development and test, password-reset and invitation links are obtainable
  from logs without a live email provider.
- **SC-004**: No password-reset or sign-in flow reveals whether a given email address has an
  account — responses are identical for known and unknown addresses.
- **SC-005**: After a successful password reset, any previously active session for that account
  can no longer be used.
- **SC-006**: A password-reset link can be used at most once and stops working after it expires.

## Assumptions

- The application's existing email-and-password authentication provides a built-in
  password-reset capability; that built-in flow will be used rather than a hand-rolled one.
- Default reset-link semantics (single use, roughly one-hour expiry) are acceptable unless
  planning finds reason to tune them.
- A production email account and verified sending domain (with the appropriate DNS records) is
  provisioned by operations. Obtaining and verifying it is a prerequisite, not part of this
  feature's code.
- Email content and branding follow the product's utilitarian "Field Manual" register; exact
  copy and layout are design details resolved during planning.
- **Deferred to planning**: the exact email-provider integration surface and the precise
  configuration/secret field shape; whether to also send an optional "your password was changed"
  confirmation email after a successful reset; the throttling thresholds and scope (per-email
  vs. per-origin) for the forgot-password endpoint; and the test strategy for the log transport
  (capturing and asserting on rendered emails and links, including any test-suite cleanup).

## Dependencies

- Builds on the existing email-and-password authentication subsystem (feature 001) and the
  invitation system (feature 002).
- Requires an external transactional email provider (Mailgun) account and a verified sending
  domain for production delivery.

## Out of Scope

- No email-verification step added to sign-up or invitation acceptance — automatically emailing
  the invitation to the bound address already establishes inbox control.
- No change to desktop access-code authentication.
- No general-purpose notification or marketing-email system beyond the two transactional flows
  and the shared module they use.
- No re-enabling of public self-service sign-up.
- No SMS or other delivery channels.

## Clarifications

### Session 2026-06-29

- Q: Should the email integration power only password reset, or also auto-email invitation
  links? → A: **Both** — one shared server-side email module serves password reset and
  automatically delivers invitation links.
- Q: When invitations are auto-emailed, what happens to the existing copy-a-link flow? → A:
  **Auto-email the invitee AND keep** the copyable link, plus add a "Resend email" action on
  pending invitations.
- Q: How should email behave when the provider is not configured (dev/test have no
  credentials)? → A: **Environment-gated** — production fails fast at startup; development and
  test log the rendered email (including links) instead of sending.

### Session 2026-06-30

- Q: When a password reset succeeds, what should happen to the account's other active
  sessions? → A: **Invalidate all other active sessions** for that account.
