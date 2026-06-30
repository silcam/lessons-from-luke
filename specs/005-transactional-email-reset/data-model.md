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
  The token in the URL query string is `encodeURIComponent`-encoded.
- **HTML-body safety** (red-team Pass 1): when `html` is rendered, the action link
  goes in an HTML-attribute-encoded `<a href>` and any user-derived value (e.g. the
  invitee address shown in an invitation email) is HTML-escaped, so the email body is
  not a markup-injection / phishing surface. `text` stays plain (link verbatim).
- **Provider wire-format safety** (red-team Pass 1): the CR/LF guard prevents SMTP
  *header* injection but NOT Mailgun *form-parameter* injection — see the
  `MailgunEmailTransport` note below for the `URLSearchParams` requirement.

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
- **Fail-closed selection** (red-team Pass 2): selection must not let a wrong/unset
  `NODE_ENV` silently pick `LogEmailTransport` in production (which would log reset/invitation
  links and send no mail — a silent failure of the recovery flow). Tie selection and the
  FR-002 startup fail-fast to the **same predicate**: whenever production-shaped `Secrets.email`
  is present/required, `getEmailTransport()` MUST return `MailgunEmailTransport` and validation
  MUST have passed — a `LogEmailTransport` is unreachable when real email config exists. Unit-test
  that production-shaped config yields the Mailgun transport, never Log.
- **`MailgunEmailTransport` hardening** (red-team Pass 1):
  - Build the `application/x-www-form-urlencoded` body with `URLSearchParams` (never
    hand-concatenated `key=value&`) so a field value containing `&`/`=` cannot inject
    extra Mailgun parameters (`bcc`, `cc`, `o:tag`, `from` override).
  - Apply a bounded request timeout (`AbortSignal.timeout`, ~10 s); a timeout is a
    normal send failure (throw) so it cannot stall the awaited reset/invitation
    response.
  - **Disable Mailgun tracking per-message** (red-team Pass 7): set the static form
    fields `o:tracking=no`, `o:tracking-clicks=no`, `o:tracking-opens=no` on **every**
    send. With click tracking enabled on the domain, Mailgun rewrites the action link
    through its redirector and stores the embedded **single-use reset token** in its
    click-analytics (a live credential retained outside our trust boundary — the
    third-party twin of the Pass-1 *our-logs* redaction), and rewrites only the `html`
    link so it no longer matches the verbatim `text` link. The per-message `o:tracking*`
    overrides win over the domain default, keep the emitted link the verbatim
    server-built URL, and keep the token out of Mailgun's analytics. Unit-test that the
    encoded body carries `o:tracking-clicks=no`.
- **Production error-log redaction** (red-team Pass 1): the production failure paths
  (`MailgunEmailTransport` throw, and the `sendResetPassword`/`onPasswordReset` catch
  in `auth.ts`) log only `to` + `subject` + error — NEVER the `text`/`html` body or
  the action link, so a single-use reset token never reaches a production log. The
  `Log`/`Memory` transports still log the link in dev/test (FR-003), which is safe
  there (no real mail; link targets the local SPA).
- **Bound the provider error, not just the body** (red-team Pass 7): the Pass-1 guard
  above treats `error` as inherently safe, but if `MailgunEmailTransport` builds its
  thrown error from the **raw** Mailgun response body, that body can echo the submitted
  `text`/link — so logging the "error" transitively leaks the token, through the one
  value Pass 1 declared safe. The transport MUST construct its thrown/logged error from
  a **bounded, structured** view (HTTP status + Mailgun's `message` field only), never
  the raw response body or any echoed request field. Unit-test that a Mailgun error
  response which echoes the submitted `text` yields a thrown error and log line with no
  link/token.

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
- **Cross-field DKIM/DMARC alignment** (red-team Pass 7): the per-field guards above are
  validated in isolation, which permits a coherent-looking but undeliverable config —
  e.g. `domain=mg.example.org` (the verified, DKIM-signing domain) with
  `fromAddress=noreply@example.org` (parent/other domain). Mailgun accepts the send but
  the message is DKIM-signed for `domain` while `From:` is a different domain, so DMARC
  alignment fails and reset/invitation mail is spam-foldered or rejected — silently,
  since the flow still returns the generic 200 (a locked-out user never gets the email,
  defeating SC-001). Validation MUST additionally check that the domain part of
  `fromAddress` **equals or is a subdomain of** `domain`, failing fast with a
  field-names-only error (never values, FR-004).

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
- **Supersession** (red-team Pass 2): issuing a new reset token for a user must invalidate
  that user's prior **un-consumed** `reset-password:*` rows, so an older still-unused link
  stops working (spec §Edge Cases "Superseded reset link"). Confirm whether better-auth does
  this by default; if not, `sendResetPassword` deletes the user's existing `reset-password`
  verification rows before/while issuing the new token. See the SUPERSEDED edge in the state
  machine below.
- **Supersession coupled to actual send + made an invariant** (red-team Pass 5): two
  refinements to the Pass 2 supersession, both required before `/sp:05-tasks` builds it:
  1. **Couple supersession to a real send.** Because the Pass 3 per-address throttle only
     suppresses the *email* (not token generation), an unconditional supersession lets an
     IP-rotating attacker who knows a victim's address repeatedly invalidate the victim's
     own live link with zero mail sent — an indefinite remote denial-of-reset. Evaluate the
     per-address throttle **first**; when over-limit (send suppressed), do **not** invalidate
     the user's prior `reset-password` rows and **delete the just-written new row** instead.
     Only a request that actually emails a new link supersedes the prior one.
  2. **Make supersession an invariant, not a racy delete.** The read-then-write
     "delete prior rows, then issue" is not atomic; two concurrent legitimate requests can
     leave two live tokens. Either reject any non-most-recent `reset-password` row for the
     user at `/reset-password` validation time, or perform invalidate+issue atomically
     (transaction / conditional delete keyed on `value = user.id`).
  3. **Keep all of it off the awaited request path** (red-team Pass 6). The throttle check,
     the supersession decision, and the suppressed-row cleanup are DB round-trips that run
     only for existing accounts; performing them synchronously in `sendResetPassword` would
     re-open the Pass 2 enumeration timing oracle (a smaller, local-DB delta). They must run
     inside the **same fire-and-forget background task** as the send, so `sendResetPassword`
     returns in account-existence-independent time.

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
- **Per-invitation resend throttle storage** (red-team Pass 2): the Pass 1 per-invitation
  resend throttle needs a counter keyed on the **invitation id**, which `customRules`
  (keyed by request path + IP) cannot express. To keep "no new table": `invitationController`
  performs a manual check against this `rateLimit` table using a synthetic key
  (e.g. `resend:<invitationId>`). Acceptable single-process fallback: a bounded in-process
  `Map`/LRU, with the documented caveat that it is per-process and resets on restart (the
  per-IP `invitationRateLimit` stays the durable floor). The implementing task must build
  this counter rather than assume one exists.
- **Per-address reset-request throttle storage** (red-team Pass 3): FR-012 and the spec's
  "Reset request flooding" edge case want repeated requests **for the same address**
  throttled, but the reset path's `customRules` are keyed by request path + IP and cannot
  express a per-address limit (same limitation as the per-invitation throttle above). Use the
  **same** manual `rateLimit`-table check pattern with a synthetic key keyed on the
  **normalized email** (e.g. `reset-req:<normalizedEmail>`), performed **inside
  `sendResetPassword`** (which runs only for accounts that exist). An over-limit address
  **suppresses the send** while the endpoint still returns the generic, timing-safe 200
  (enumeration- and timing-safe: the check rides the already-backgrounded send path from the
  Pass 2 timing mitigation). When the throttle suppresses the send it MUST **also skip
  supersession and delete the just-written `verification` row** (red-team Pass 5), so a
  suppressed flood request cannot invalidate a victim's live reset link (denial-of-reset);
  the just-created token must not linger. Acceptable single-process fallback: the same bounded in-process `Map`/LRU
  with the per-process/reset-on-restart caveat. The implementing task must build this counter,
  or the team must record an explicit decision that per-IP is the accepted scope.

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
   │  newer /request-password-reset for same user ⇒ SUPERSEDED (prior row invalidated,
   │      red-team Pass 2) ──▶ POST /reset-password ⇒ 400 INVALID_TOKEN (spec §Edge Cases)
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
