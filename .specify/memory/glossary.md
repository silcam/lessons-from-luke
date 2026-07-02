# Glossary — Ubiquitous Language

Single source of truth for domain terminology across code, specs, and discussion. One concept = one
canonical term. Entries are alphabetical.

Format: **Term** (part-of-speech): definition. [See: related]

---

**Account Status** (noun): The Active/Deactivated axis of a User Account, derived from
`user.deactivatedAt` (`NULL` ⇒ Active, non-`NULL` ⇒ Deactivated). Orthogonal to Role; governs whether
the account may sign in. [See: Deactivate, Reactivate, User Account]

**Active** (adjective): An Account Status meaning the account may sign in (`deactivatedAt IS NULL`).
[See: Account Status]

**Admin** (noun/adjective): The elevated Role, carried by `user.admin = true`. Grants access to
`/api/admin/*` and the admin screens. Do **not** introduce a separate `role` string or `banned`
column — the `admin` boolean is the canonical role model. [See: Role, Standard, requireAdmin]

**Deactivate** (verb): Admin action that offboards an account by setting `deactivatedAt = now()` and
revoking its sessions, blocking sign-in. Reversible (never a hard delete), preserving the `invitedBy`
audit chain. [See: Reactivate, Deactivated, Session]

**Deactivated** (adjective): An Account Status meaning the account cannot sign in
(`deactivatedAt IS NOT NULL`); the row is retained in the Roster for audit. [See: Account Status]

**Force Sign-out** (verb): Admin action that revokes an account's active Sessions without changing its
Account Status; the account stays Active and can sign back in. Reuses the deactivation session-revoke
primitive. [See: Session, Deactivate]

**invitedBy** (noun): The `invitation.invitedBy → user(id)` audit relationship (from `002`) recording
which administrator issued an invitation. Preserved by reversible Deactivate (no hard delete).
[See: Invitation]

**Invitation** (noun): An administrator-issued, email-bound, single-use link that onboards one account
(feature `002`). The onboarding counterpart to Deactivate offboarding. [See: invitedBy]

**Last-admin Guard** (noun): The server-side invariant that the system never reaches zero active
Admins. Enforced transactionally (`SELECT … FOR UPDATE` over the active-admin set) so concurrent
demote/deactivate requests cannot both remove the last Admin. [See: Admin, Self-lockout Guard]

**Promote** (verb): Change a Standard account's Role to Admin (`admin = true`). [See: Demote, Role]

**Demote** (verb): Change an Admin account's Role to Standard (`admin = false`). Refused for the last
active Admin. [See: Promote, Last-admin Guard]

**Reactivate** (verb): Admin action that restores a Deactivated account by setting
`deactivatedAt = NULL`, allowing sign-in again. [See: Deactivate]

**requireAdmin** (noun): Express middleware (from `001`) mounted at `app.use("/api/admin", …)` that
returns 401 when unauthenticated and 403 for a non-Admin. All user-management endpoints inherit it.
[See: Admin, requireSameOrigin]

**requireSameOrigin** (noun): Express middleware (from `002`) enforcing the same-origin allow-list on
state-changing POSTs. Applied to every user-management mutation. [See: requireAdmin]

**Role** (noun): The Admin/Standard distinction carried by `user.admin`; the mechanism granting or
denying administrative capabilities. Toggled by Promote/Demote. Orthogonal to Account Status.
[See: Admin, Standard, Account Status]

**Roster** (noun): The admin-only list of **all** User Accounts (name, email, Role, Account Status,
created date), including Deactivated ones. The surface from which role changes and offboarding are
performed. [See: User Account]

**Self-lockout Guard** (noun): The server-side rule preventing an administrator from Deactivating
their own account. (Self-Demote is allowed while another active Admin remains.) [See: Last-admin Guard]

**Session** (noun): An authenticated login instance belonging to a User Account (`session.userId →
user(id)`, cascade). Revoked immediately (`DELETE FROM "session"`) on Deactivate or Force Sign-out.
[See: Deactivate, Force Sign-out]

**Standard** (noun/adjective): The non-elevated Role (`user.admin = false`). [See: Admin, Role]

**User Account** (noun): A person's web login, stored in the auth-owned `"user"` table (name, email,
Role, Account Status, created date). May author Invitations and hold zero or more Sessions. Never hard
-deleted by this feature. [See: Roster, Role, Account Status]
</content>
