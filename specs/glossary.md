# Lessons from Luke — Ubiquitous Language Glossary

> Maintained by the `/glossary` skill. Single source of truth for domain terminology.
> Format: **Term** (part-of-speech): Definition. [See: related-term]

---

## A

**Account** (noun): The credential a recipient ends up with after redeeming an invitation, carrying the role granted by the invitation. Consists of a `user` row and a linked `account` (credential) row in the auth schema. Each email address maps to at most one Account. [See: User, Invitation]

**Account Status** (noun): The Active/Deactivated axis of a User Account, derived from `user.deactivatedAt` (`NULL` ⇒ Active, non-`NULL` ⇒ Deactivated). Orthogonal to Role; governs whether the account may sign in. [Docs: specs/006-user-account-management/data-model.md#state-model-account-status] [See: Deactivate, Reactivate, User Account]

**Active** (adjective): An Account Status meaning the account may sign in (`deactivatedAt IS NULL`). [See: Account Status]

**Administrator** (noun): A signed-in User with the `admin` flag set to `true`. The only actor who may create, list, retract, or re-copy Invitations, and (from `006`) view the account Roster, change roles, deactivate/reactivate accounts, and force-sign-out sessions. Also called an Admin when referring to the Role value rather than the person. [See: User, Invitation, Admin, Role]

**Admin** (noun/adjective): The elevated Role value carried by `user.admin = true`, distinct from Administrator (the person holding that role — see that entry for the disambiguation). Grants access to `/api/admin/*` and the admin screens via `requireAdmin`. The canonical role model — do **not** introduce a separate `role` string or `banned` column (alternative considered and rejected in `006` research.md Decision 3). [See: Administrator, Role, Standard, requireAdmin]

**Accepted** (noun): Terminal status of an Invitation that has been successfully redeemed; an Account exists for the bound email. [See: Invitation, Pending, Retracted, Expired]

## D

**Deactivate** (verb): Admin action (`006`) that offboards an account by setting `deactivatedAt = now()` and revoking its sessions in one transaction, blocking sign-in. Reversible (never a hard delete), preserving the `invitedBy` audit chain. Refused by the Self-lockout Guard and the Last-admin Guard. [See: Reactivate, Deactivated, Account Status, Session, Self-lockout Guard, Last-admin Guard]

**Deactivated** (adjective): An Account Status meaning the account cannot sign in (`deactivatedAt IS NOT NULL`); the row is retained in the Roster for audit, never hard-deleted. [See: Account Status]

**Demote** (verb): Change an Admin account's Role to Standard (`admin = false`). Refused for the last active Admin (Last-admin Guard); permitted as self-demotion while another active Admin remains. [See: Promote, Last-admin Guard, Role]

## E

**Expired** (noun): Terminal status of a Pending Invitation whose 14-day window has elapsed without redemption. The link no longer works; the record is retained for audit. [See: Invitation, Pending]

## F

**Force Sign-out** (verb): Admin action (`006`) that revokes an account's active Sessions without changing its Account Status; the account stays Active and can sign back in. Reuses the Deactivate session-revoke primitive; not disabled on the acting admin's own row (by design). [See: Session, Deactivate]

## I

**invitedBy** (noun): The `invitation.invitedBy → user(id)` audit relationship (from `002`) recording which administrator issued an invitation. Preserved by reversible Deactivate — this feature never hard-deletes a `user` row, so the relationship is never violated. [See: Invitation, Deactivate]

**Invitation** (noun): An administrator-issued, single-use authorization to create one Account. Bound to a specific recipient email address and a granted role (administrator or standard). Key attributes: email, role, status, creation date, expiry date, acceptance date (when Accepted), creating administrator, and a secret redemption token. The onboarding counterpart to Deactivate offboarding (`006`). [Docs: specs/002-invitation-system/spec.md#key-entities] [See: Pending, Accepted, Retracted, Expired, invitedBy, Deactivate]

**Invitation link** (noun): The URL shared with a Recipient that encodes the redemption token. Format: `${BETTER_AUTH_URL}/invitation/${token}`. Single-use; valid only while the Invitation is Pending and non-expired. [See: Invitation, Token]

## L

**Language** (noun): A translation target in the domain layer, with progress tracking and optional motherTongue variant. Managed through the `Persistence` interface. [See: Persistence]

**Last-admin Guard** (noun): The server-side invariant (`006`) that the system never reaches zero active Admins. Enforced transactionally (`SELECT … FOR UPDATE` over the active-admin set, locked in a deterministic order) so concurrent Demote/Deactivate requests targeting the last two Admins cannot both succeed. [Docs: specs/006-user-account-management/data-model.md#last-admin-lock-shared-fragment-decision-4] [See: Admin, Self-lockout Guard, Deactivate, Demote]

**Lesson** (noun): Domain entity organized by Book (Luke/Acts), Series, and Lesson number. Contains LessonStrings. [See: LessonString, TString]

**LessonString** (noun): Links a master string (TString) to a Lesson with type (content/styles/meta) and xpath.

## P

**Pending** (noun): The initial, active status of an Invitation. A Pending, non-expired Invitation has a working link; only Pending Invitations can be Retracted or redeemed. [See: Invitation, Accepted, Retracted, Expired]

**Persistence** (noun): The interface (`src/core/interfaces/Persistence.ts`) defining all domain data operations. All domain data access MUST go through this abstraction. [See: PGStorage, LocalStorage]

**PGStorage** (noun): PostgreSQL implementation of the `Persistence` interface for production. Uses the porsager `postgres@1` driver on the domain `pg.Pool`. [See: Persistence]

**Promote** (verb): Change a Standard account's Role to Admin (`admin = true`). No guard — any Standard account may be promoted. [See: Demote, Role]

## R

**Reactivate** (verb): Admin action (`006`) that restores a Deactivated account by setting `deactivatedAt = NULL`, allowing sign-in again. Restores the **same** credential (does not rotate the password) — not an appropriate recovery path for a compromised account (plan.md §Security Considerations). [See: Deactivate, Account Status]

**Recipient** (noun): The person who receives an Invitation link and redeems it to create their Account. Supplies a password and display name; their email is pre-bound by the Invitation. [See: Invitation, Account]

**requireAdmin** (noun): Express middleware (from `001`) mounted at `app.use("/api/admin", …)` that returns 401 when unauthenticated and 403 for a non-Admin. All user-management endpoints (`006`) inherit it. [See: Admin, requireSameOrigin]

**requireSameOrigin** (noun): Express middleware (from `002`) enforcing the same-origin allow-list on state-changing POSTs. Applied to every user-management mutation (`006`): role change, deactivate, reactivate, revoke-sessions. [See: requireAdmin]

**Retracted** (noun): Terminal status of a Pending Invitation that an Administrator has explicitly cancelled. The link stops working immediately; the record is retained for audit. [See: Invitation, Pending]

**Role** (noun): The Admin/Standard distinction carried by `user.admin`; the mechanism granting or denying administrative capabilities. Toggled by Promote/Demote. Orthogonal to Account Status (a role change does not change whether the account can sign in). [See: Admin, Standard, Account Status]

**Roster** (noun): The admin-only list (`006`) of **all** User Accounts — name, email, Role, Account Status, created date — including Deactivated ones, each with the requesting administrator's own row marked self. The surface from which role changes and offboarding are performed. [Docs: specs/006-user-account-management/spec.md#user-story-1---view-the-account-roster-priority-p1] [See: User Account, Administrator]

## S

**Self-lockout Guard** (noun): The server-side rule (`006`) preventing an administrator from Deactivating their own account. Distinct from self-Demote, which is permitted while another active Admin remains. [See: Last-admin Guard, Deactivate]

**Session** (noun): An authenticated login instance belonging to a User Account (`session.userId → user(id)`, cascade). Revoked immediately (`DELETE FROM "session"`) on Deactivate or Force Sign-out; keyed to the account so revocation ends all of that account's sessions. [See: Deactivate, Force Sign-out]

**Standard** (noun/adjective): The non-administrator Role, carried by `user.admin = false`. Granted to a newly created Account when the Invitation's role is `'standard'`; may be Promoted to Admin (`006`). [See: Admin, Role, Invitation, Promote]

## T

**Token** (noun): A 256-bit cryptographically random value (base64url, 43 chars) that forms the secret part of an Invitation link. Only the SHA-256 hash (`tokenHash`) is stored for lookup; an AES-256-GCM-encrypted copy (`tokenEnc`) is stored for re-copy without storing plaintext. [See: Invitation link, Invitation]

**TString** (noun): A translated string with history tracking, linked to a master ID. Core domain type.

## U

**User** (noun): The better-auth authentication entity (auth schema, `"user"` table). Holds `id`, `email`, `name`, `admin` (boolean), `emailVerified`, and (from `006`) `deactivatedAt`. Created for an invitation Recipient at accept time via direct SQL. Distinct from the domain `Persistence` layer's data entities. Also called a User Account when referring to it as a Roster row rather than the bare auth-schema entity — same underlying `"user"` row, see that entry for the disambiguation. [See: Account, Administrator, Recipient, User Account]

**User Account** (noun): The same underlying `"user"` table row as User (see that entry), named for its role in the `006` Roster / access-control surface: a person's web login with display name, email, Role, Account Status, and created date. May author Invitations (`invitedBy`) and hold zero or more Sessions. Never hard-deleted. [Docs: specs/006-user-account-management/spec.md#key-entities] [See: User, Roster, Role, Account Status]
