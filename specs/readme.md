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

## Require Web Authentication

Keywords: web authentication gate, require login, require sign-in, authentication required, protected routes, route guard, gated routes, default-deny routing, public allowlist, redirect to login, login redirect, post-login return, return-to URL, deep link sign-in, /translate auth, translation page login, lesson page login, non-admin routes require auth, desktop no auth, desktop unaffected, offline desktop, client-side auth gate, web-only enforcement, session required, sign-in wall, invitation route stays public, 401, 403, stacked on invitation system
Spec: specs/003-web-auth-gate/spec.md

## Desktop App Authentication (Code-Based Pairing) + Shared-API Enforcement

Keywords: desktop authentication, desktop login, connect desktop to account, device pairing, code-based pairing, pairing code, device grant, OAuth device flow, RFC 8628, polling pairing, no loopback, no localhost server, no custom URL scheme, device credential, bearer token, paired device, disconnect device, revoke device, admin revoke by user, lost laptop, shared API enforcement, require auth on /api, lock down API, 401 anonymous, enforcement flag default off, feature flag rollout, offline-first desktop, Electron auth, stay connected across restarts, sign in then approve, electron main process header, stacked on web-auth-gate
Spec: specs/004-desktop-auth-pairing/spec.md

## Transactional Email & Self-Service Password Reset

Keywords: transactional email, Mailgun, email service, send email, SMTP, password reset, forgot password, reset link, self-service recovery, account recovery, locked out, change password, set new password, email-and-password auth, better-auth sendResetPassword, account enumeration, invalidate sessions, sign out other sessions, auto-email invitation, invitation email, resend invitation, resend email, invitation delivery, email-bound invite, environment-gated email, fail-fast secrets, log transport, dev/test email logging, secrets.json, sending domain, from-address, rate limiting, email flooding, server-only email, web-only
Spec: specs/005-transactional-email-reset/spec.md

## Covers in the Platform

Keywords: cover, covers, quarter cover, cover page, front cover, book cover, A4 cover, A3 cover, cut-sheet, booklet, cover format, reserved lesson number, 97, 98, TOC 99 precedent, cover upload, cover download, cover translation, auto-populate translations, TString dedup, master string reuse, copyright line, publisher address, title subtitle, hand-edit elimination, LibreOffice hand-editing, SOP 22, SOP 30.2, WS-3, filename detection, Q vs T series prefix, Cover (A4) display name, print handoff, color cover, quarter assembly unaffected
Spec: specs/008-covers-in-platform/spec.md

## Automated Quarter-Styles Template Application

Keywords: quarter styles template, styles template, template application, load styles, print-ready, print styles, M.T. highlight, mother tongue highlight, yellow highlight, remove highlight, background color, paragraph styles, page styles, style source, swappable asset, stand-in template, Q2 reference master, assembled quarter styling, assembly job failure, LibreOffice styles, publishing automation, WS-2c, SOP 16
Spec: specs/009-quarter-styles-template/spec.md

## Auto-Populate Verse-Reference Strings

Keywords: verse reference, scripture reference, book name split, numeric reference, chapter verse, auto-populate references, pre-fill references, isolated verse reference, text-shape recognition, canAutoTranslate predicate, unsplit reference splitter, split book name, translate once, master string dedup, trim whitespace dedup, hyphen en-dash dash, cross-chapter range, backfill references, re-normalize masters, lesson-update issues, prose reference false positive, numbered books, Sub-Head 1, M.T. Text Lesson Title Scrip Reference, M.T. Table of Contents, Lesson Title Scrip Reference, four reference styles, auto-translate, defaultTranslations, WS-4, SOP 30.3, publishing automation
Spec: specs/011-verse-reference-auto-population/spec.md

## Language Project Archiving and Detail-View Routing

Keywords: language project, delete language, remove language, archive language, soft delete, deprecate language, source language, defaultSrcLang, dependent language, translation target, language list, Languages screen, admin delete, un-archive, restore, URL routing, language detail URL, /languages/:languageId, browser back forward, page refresh, react-router, shareable link, permalink, translate access, translator picker
Spec: specs/012-language-archive-routing/spec.md

## Language Project Rename

Keywords: rename language, language name, edit language name, change name, inline edit, pencil icon, Edit link, toggle-to-edit, language project, admin language page, LanguageView, fix typo in name, duplicate name, 409, unique name, trim whitespace, name validation, display name, admin-only, language settings
Spec: specs/016-language-rename/spec.md

## Quarter Template Full Style-Family Application

Keywords: quarter template overwrite, all style families, page styles, master pages, frame styles, list styles, numbering styles, first page footer, CC footer, Creative Commons footer, license footer, footer removal, lesson title spacing, lesson number graphic spacing, lesson opening layout, chapterized footers, pagination regression, load styles overwrite, supersedes 009 FR-003, assembled quarter styling, Chris Jackson feedback, stand-alone template vs quarter template, print-ready book
Spec: specs/013-quarter-template-full-styles/spec.md

## Quarter Pagination and Coloring-Page Style Fixes

Keywords: page numbering, page numbers wrong, pagination, roman numerals, front matter, arabic restart, page number offset, text:page-adjust, page-adjust -1, page-adjust -2, page number field, footer page number, first page suppression, recto, verso, right-hand page, odd page start, duplex printing, blank page, filler page, phantom page, counted but not rendered, supersedes 007 FR-003, coloring page, memory verse, duplicate memory verse, wrong paragraph style, M.T. Coloring Page - Memory Verse, automatic style collision, P12 name collision, style name dedupe, insertDocumentFromURL merge, soffice assembly, client feedback 2026-08-11
Spec: specs/017-quarter-pagination-fixes/spec.md

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
