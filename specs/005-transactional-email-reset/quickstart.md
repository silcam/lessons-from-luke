# Quickstart: Transactional Email & Self-Service Password Reset

**Feature**: 005-transactional-email-reset

This is the operator/developer orientation for the email + password-reset feature.
No new database migration is required (research.md §D10).

## What this feature adds

1. A **server-only email module** (`src/server/email/`) with one `EmailTransport`
   interface and three implementations selected by `NODE_ENV`:
   - production → Mailgun REST (`MailgunEmailTransport`)
   - development → console log (`LogEmailTransport`) — transmits nothing
   - test → in-memory capture (`MemoryEmailTransport`)
2. **Self-service password reset** wired onto better-auth's built-in endpoints
   (`/api/auth/request-password-reset`, `/api/auth/reset-password`) via `getAuth()` options.
3. **Invitation auto-delivery + resend** layered onto the existing admin endpoints.
4. New SPA routes `/forgot-password` and `/reset-password`, plus a "Forgot password?"
   link on the sign-in screen and a "Resend email" action on pending invitations.

## Local development (no Mailgun account needed)

```bash
yarn dev-web        # NODE_ENV=development → LogEmailTransport
```

- Trigger a reset from the sign-in screen → "Forgot password?" → submit your dev email.
- The rendered email **and its reset link** are printed to the dev-web server console.
  Copy the link, open it, set a new password (≥ 12 chars), sign in.
- Create an invitation as admin → the rendered invitation email + link are logged; the
  link is also shown in the admin UI as today. Use "Resend email" on a pending row to log
  it again.

## Production configuration (fail-fast)

Add an `email` block to `secrets.json` (values are examples; never commit real keys):

```jsonc
{
  "email": {
    "apiKey": "key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "domain": "mg.example.org",
    "fromAddress": "Lessons from Luke <no-reply@mg.example.org>",
    "baseUrl": "https://api.mailgun.net" // or https://api.eu.mailgun.net for EU domains
  }
}
```

- In `NODE_ENV=production` the server **refuses to start** if `email` is missing or any of
  `apiKey` / `domain` / `fromAddress` is empty or left at the placeholder default — the
  error names the offending field and never prints a secret value (FR-002, FR-004).
- Ops prerequisite (not code): a verified Mailgun sending domain with SPF/DKIM/DMARC DNS
  records (spec §Assumptions / §Dependencies).

## Verifying the acceptance criteria

| Criterion | How to verify |
| --------- | ------------- |
| SC-001 reset end-to-end, no admin | dev: forgot-password → link from logs → set password → sign in |
| SC-002 invite by email + fallbacks | create invitation → email logged/sent, link shown, resend works |
| SC-003 prod fail-fast / dev logs | start prod with no `email` block → clear startup error; dev logs link |
| SC-004 no enumeration | submit unknown email → identical generic response, nothing sent/logged-as-sent |
| SC-005 sessions revoked | sign in elsewhere, reset password, confirm the other session is dead |
| SC-006 single-use / expiry | reuse a consumed link → rejected; wait past 1h → rejected |

## Test commands

```bash
# Unit + controller (email module, message builders, invitation send/resend, reset thunks/UI)
NODE_ENV=test npx jest --runInBand

# Integration (real better-auth child-process server; reset token read from verification table)
yarn test:integration

# Web E2E (full forgot-password → reset → sign-in journey)
yarn test-e2e
```

- In-process tests assert on `MemoryEmailTransport.sentEmails`; `jestSetupAfterEnv.ts`
  clears it (and resets the transport singleton) in `afterEach`.
- Integration reset tests obtain the link by reading `verification` rows with
  `identifier = 'reset-password:<token>'` over the auth pool (research.md §D9).
