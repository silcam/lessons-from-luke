# Phase 1 Data Model: Transactional Email & Self-Service Password Reset

**Feature**: 005-transactional-email-reset
**Date**: 2026-06-30

This feature introduces **no new database tables and no migration** (research.md §D10).
It adds in-memory/transport types and reuses better-auth's existing auth-owned tables.
Entities below are grouped into (A) new code-level types and (B) reused persisted tables.

---

## A. New code-level types (server-only, `src/server/email/`)

### EmailMessage

A fully-rendered, ready-to-send transactional message. Not persisted.

| Field     | Type     | Rules                                                                 |
| --------- | -------- | -------------------------------------------------------------------- |
| `to`      | `string` | Single RFC-5322 recipient address. Required, non-empty.              |
| `subject` | `string` | Required, non-empty, single line (no CR/LF — header-injection safe). |
| `text`    | `string` | Required plain-text body. Contains the action link verbatim.         |
| `html`    | `string` | Optional HTML body. When present, contains the action link as `<a>`. |

- **Validation**: `subject` and `to` MUST NOT contain CR/LF (reuse the control-character
  guard pattern from `invitationStore.hasControlChars`) to prevent header injection.
- **Link rule**: the action link (reset or invitation URL) is embedded in `text`
  (and `html` if present) so the dev/test log transport always exposes it (FR-003).

### EmailTransport (interface)

The server-only capability boundary (FR-001). One method.

| Member               | Signature                              | Contract                                            |
| -------------------- | -------------------------------------- | --------------------------------------------------- |
| `send(message)`      | `(EmailMessage) => Promise<void>`      | Resolves on accepted-for-delivery; **throws** on any failure. |

Implementations:

| Implementation          | Env          | Behavior                                                                 |
| ----------------------- | ------------ | ------------------------------------------------------------------------ |
| `MailgunEmailTransport` | production   | POST to Mailgun REST API; throw on non-2xx or network error.             |
| `LogEmailTransport`     | development  | Write rendered `to`/`subject`/`text`(+link) to the logger; never sends.  |
| `MemoryEmailTransport`  | test         | Append to in-process `sentEmails: SentEmail[]`; also log; never sends.   |

- **Selection**: `getEmailTransport()` singleton chooses by `NODE_ENV` (mirrors
  `getAuth()`); `setEmailTransport()` / `resetEmailTransport()` for test isolation.

### SentEmail (test-only)

Captured record for in-process assertions (research.md §D9).

| Field     | Type     | Notes                                  |
| --------- | -------- | -------------------------------------- |
| `to`      | `string` | As sent.                               |
| `subject` | `string` | As sent.                               |
| `text`    | `string` | As sent (assert the link is present).  |
| `html`    | `string \| undefined` | As sent.                  |

- **Lifecycle**: `sentEmails` is cleared by `resetEmailTransport()` in
  `jestSetupAfterEnv.ts` `afterEach` (parallels the existing `DELETE FROM "invitation"`).

### EmailConfig (validated subset of `Secrets.email`)

| Field         | Type     | Production rule                                              |
| ------------- | -------- | ----------------------------------------------------------- |
| `apiKey`      | `string` | Required, non-empty, not the placeholder default.           |
| `domain`      | `string` | Required, non-empty, not the placeholder default.           |
| `fromAddress` | `string` | Required, non-empty, not the placeholder default.           |
| `baseUrl`     | `string` | Optional; default `https://api.mailgun.net`.                |

- **Validation site**: `src/server/util/secrets.ts`, production-gated, fail-fast, field
  names only in error text — never values (FR-002, FR-004).

---

## B. Reused persisted tables (auth-owned `pg.Pool`; no schema change)

### verification (existing — better-auth)

Holds the single-use, time-limited password-reset token.

| Column       | Use for this feature                                                        |
| ------------ | --------------------------------------------------------------------------- |
| `identifier` | `reset-password:<token>` — namespaced key better-auth writes/reads.         |
| `value`      | The target `user.id` the token resolves to.                                 |
| `expiresAt`  | Now + `resetPasswordTokenExpiresIn` (default 3600 s). Past-due ⇒ rejected.  |

- **State transition**: created on `/request-password-reset` (only when the user exists);
  **deleted** on successful `/reset-password` (single use, FR-010/SC-006). An expired or
  already-deleted row ⇒ `INVALID_TOKEN` (FR-010).

### session (existing — better-auth)

| Operation | Trigger                | Effect                                                       |
| --------- | ---------------------- | ----------------------------------------------------------- |
| delete    | successful reset       | `revokeSessionsOnPasswordReset: true` ⇒ `deleteUserSessions(userId)` removes all rows for the account (FR-009/SC-005). |

### account (existing — better-auth)

| Operation | Trigger          | Effect                                                          |
| --------- | ---------------- | -------------------------------------------------------------- |
| update    | successful reset | `password` column updated with the new Argon2id hash (FR-008). |

### rateLimit (existing — better-auth)

- Backs the new `customRules` for `/request-password-reset` and `/reset-password`
  (research.md §D8). No schema change — already in use for `/sign-in/email`.

### invitation (existing — feature 002)

- **Unchanged.** Auto-delivery and resend read it via `createInvitation` /
  `getInvitationLink`; resend re-derives the existing `tokenEnc` and does **not** modify
  `expiresAt`, `tokenHash`, or status (edge case "Repeated resend"). Derived-status rule
  (`STATUS_CASE_SQL`) continues to gate resend to `pending` rows (FR-016).

---

## State machine — password reset (token lifecycle)

```text
(no token)
   │  POST /api/auth/request-password-reset  (user exists)
   ▼
PENDING ── expiresAt reached ──▶ EXPIRED ──▶ POST /reset-password ⇒ 400 INVALID_TOKEN (FR-010)
   │
   │  POST /api/auth/reset-password (valid token, policy-valid newPassword)
   ▼
CONSUMED (verification row deleted) ──▶ re-use ⇒ 400 INVALID_TOKEN (single use, SC-006)
   │
   ├─▶ account.password updated (FR-008)
   ├─▶ all sessions for user deleted (FR-009)
   └─▶ onPasswordReset ⇒ best-effort "password changed" email (D7)
```

For an **unknown email**, no token is created and no email is sent, yet the response is
the identical generic body (FR-007/SC-004) — enforced by better-auth, verified in
research.md §D4.
