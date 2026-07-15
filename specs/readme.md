# Specs Index (The Pin)

This file is a keyword-searchable index of feature specifications under `specs/`. Future agents should
scan it first to discover existing specs before creating new ones.

## Better-Auth Migration

Keywords: authentication, auth, login, sign-in, signin, password, Argon2id, password hashing, better-auth, session, session cookie, admin, authorization, 401, 403, invitation-only, no public sign-up, user account, credentials, email login, server-only auth, security migration, cookie-session removal, isolated auth DB driver
Spec: specs/001-better-auth-migration/spec.md

## Invitation System

Keywords: invitation, invite, invitation link, sign-up link, single-use invite, email-bound invitation, admin-issued invite, onboarding, account creation, redeem invitation, accept invite, retract invitation, revoke invite, expire invitation, 14-day expiry, pending accepted expired retracted, invitation management screen, admin onboarding, role grant, copy link, no email sending, recipient sign-up, server-only auth, stacked on better-auth, 401, 403
Spec: specs/002-invitation-system/spec.md

## Require Web Authentication

Keywords: web authentication gate, require login, require sign-in, authentication required, protected routes, route guard, gated routes, default-deny routing, public allowlist, redirect to login, login redirect, post-login return, return-to URL, deep link sign-in, /translate auth, translation page login, lesson page login, non-admin routes require auth, desktop no auth, desktop unaffected, offline desktop, client-side auth gate, web-only enforcement, session required, sign-in wall, invitation route stays public, 401, 403, stacked on invitation system
Spec: specs/003-web-auth-gate/spec.md

## Desktop App Authentication (Code-Based Pairing) + Shared-API Enforcement

Keywords: desktop authentication, desktop login, connect desktop to account, device pairing, code-based pairing, pairing code, device grant, OAuth device flow, RFC 8628, polling pairing, no loopback, no localhost server, no custom URL scheme, device credential, bearer token, paired device, disconnect device, revoke device, admin revoke by user, lost laptop, shared API enforcement, require auth on /api, lock down API, 401 anonymous, enforcement flag default off, feature flag rollout, offline-first desktop, Electron auth, stay connected across restarts, sign in then approve, electron main process header, stacked on web-auth-gate
Spec: specs/004-desktop-auth-pairing/spec.md

## Transactional Email & Self-Service Password Reset

Keywords: transactional email, Mailgun, email service, send email, SMTP, password reset, forgot password, reset link, self-service recovery, account recovery, locked out, change password, set new password, email-and-password auth, better-auth sendResetPassword, account enumeration, invalidate sessions, sign out other sessions, auto-email invitation, invitation email, resend invitation, resend email, invitation delivery, email-bound invite, environment-gated email, fail-fast secrets, log transport, dev/test email logging, secrets.json, sending domain, from-address, rate limiting, email flooding, server-only email, web-only
Spec: specs/005-transactional-email-reset/spec.md

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
