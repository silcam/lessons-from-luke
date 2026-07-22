# Specs Index (The Pin)

This file is a keyword-searchable index of feature specifications under `specs/`. Future agents should
scan it first to discover existing specs before creating new ones.

## Better-Auth Migration

Keywords: authentication, auth, login, sign-in, signin, password, Argon2id, password hashing, better-auth, session, session cookie, admin, authorization, 401, 403, invitation-only, no public sign-up, user account, credentials, email login, server-only auth, security migration, cookie-session removal, isolated auth DB driver
Spec: specs/001-better-auth-migration/spec.md

## Invitation System

Keywords: invitation, invite, invitation link, sign-up link, single-use invite, email-bound invitation, admin-issued invite, onboarding, account creation, redeem invitation, accept invite, retract invitation, revoke invite, expire invitation, 14-day expiry, pending accepted expired retracted, invitation management screen, admin onboarding, role grant, copy link, no email sending, recipient sign-up, server-only auth, stacked on better-auth, 401, 403
Spec: specs/002-invitation-system/spec.md

## Assembled Quarter Download

Keywords: assembled quarter, quarter book, quarter download, assemble quarter, whole quarter, full book, combine lessons, merge lessons, single document, one file download, TOC plus 13 lessons, table of contents, series download, editable ODT, continuous page numbering, first-page number suppression, master document, LibreOffice assembly, soffice, background job, in-progress assembling, bilingual, single-language, monolingual, publishing automation, SOP 30.1, WS-2b, replace odm master document, no PDF, no covers
Spec: specs/007-assembled-quarter-download/spec.md

## Transactional Email & Self-Service Password Reset

Keywords: transactional email, Mailgun, email service, send email, SMTP, password reset, forgot password, reset link, self-service recovery, account recovery, locked out, change password, set new password, email-and-password auth, better-auth sendResetPassword, account enumeration, invalidate sessions, sign out other sessions, auto-email invitation, invitation email, resend invitation, resend email, invitation delivery, email-bound invite, environment-gated email, fail-fast secrets, log transport, dev/test email logging, secrets.json, sending domain, from-address, rate limiting, email flooding, server-only email, web-only
Spec: specs/005-transactional-email-reset/spec.md

## Automated Quarter-Styles Template Application

Keywords: quarter styles template, styles template, template application, load styles, print-ready, print styles, M.T. highlight, mother tongue highlight, yellow highlight, remove highlight, background color, paragraph styles, page styles, style source, swappable asset, stand-in template, Q2 reference master, assembled quarter styling, assembly job failure, LibreOffice styles, publishing automation, WS-2c, SOP 16
Spec: specs/009-quarter-styles-template/spec.md

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
