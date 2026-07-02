# Specs Index (The Pin)

This file is a keyword-searchable index of feature specifications under `specs/`. Future agents should
scan it first to discover existing specs before creating new ones.

## Better-Auth Migration

Keywords: authentication, auth, login, sign-in, signin, password, Argon2id, password hashing, better-auth, session, session cookie, admin, authorization, 401, 403, invitation-only, no public sign-up, user account, credentials, email login, server-only auth, security migration, cookie-session removal, isolated auth DB driver
Spec: specs/001-better-auth-migration/spec.md

## Invitation System

Keywords: invitation, invite, invitation link, sign-up link, single-use invite, email-bound invitation, admin-issued invite, onboarding, account creation, redeem invitation, accept invite, retract invitation, revoke invite, expire invitation, 14-day expiry, pending accepted expired retracted, invitation management screen, admin onboarding, role grant, copy link, no email sending, recipient sign-up, server-only auth, stacked on better-auth, 401, 403
Spec: specs/002-invitation-system/spec.md

## User Account Management

Keywords: user account management, admin roster, user list, list users, account roster, role management, change role, promote admin, demote admin, make admin, remove admin, last admin guard, deactivate account, reactivate account, disable user, offboarding, revoke access, block sign-in, force sign-out, revoke sessions, kill sessions, terminate session, self-lockout guard, no hard delete, soft deactivate, Active Deactivated status, admin-only screen, 401, 403, same-origin, better-auth, session revocation, user admin boolean, stacked on invitation system, web-only auth
Spec: specs/006-user-account-management/spec.md

## How to Update This File

- Add one entry per feature spec, before this section.
- Entry format:

  ```
  ## <Feature Title>

  Keywords: kw1, kw2, kw3, ...
  Spec: specs/<branch-name>/spec.md
  ```

- Keywords should cover: the feature name and synonyms, key technologies/CLI tools named in the spec,
  domain terms from `docs/glossary.md`, and how someone might describe the problem _before_ knowing the
  spec's vocabulary.
- If an entry already exists for a feature, update its Keywords line in place rather than duplicating.

> Note: `specs/` also contains standalone planning/reference docs that are not feature specs:
> `codebase-summary.md`, `node-24-upgrade-plan.md`, `test-reliability-plan.md`, and the
> `brainstorms/` directory (pre-spec requirements docs).
