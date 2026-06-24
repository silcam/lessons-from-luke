# Quickstart: Invitation System

**Feature**: `002-invitation-system` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This walks the full create → redeem → manage loop end-to-end, plus how to run the new tests. It
assumes the `001-better-auth-migration` stack is present (this branch is stacked off it) and a
valid `secrets.json` with `adminEmail`, `adminPassword` (≥12 chars), and `cookieSecret` (≥32 chars).

## 0. One-time setup

```bash
yarn install
# Run the new invitation migration against each DB you use:
yarn migrate           # production DB
yarn migrate:dev       # dev DB (if you use the dev env)
yarn migrate:test      # test DB (CI/Docker run this)
# In production/dev, the link origin comes from BETTER_AUTH_URL:
export BETTER_AUTH_URL=https://your-host.example   # https required in production
```

## 1. Issue an invitation (admin) — US1

Sign in as the seeded admin in the web app, open the invitations management screen, enter a new
recipient email, choose a role (Standard or Administrator), and click Create. Copy the link shown.

Equivalent API:

```bash
# (use the admin session cookie from signing in at /api/auth/sign-in/email)
curl -X POST http://localhost:8081/api/admin/invitations \
  -H 'Content-Type: application/json' --cookie "$ADMIN_COOKIE" \
  -d '{"email":"newperson@example.com","role":"standard"}'
# → 201 { "id":"...", "email":"newperson@example.com", "role":"standard",
#         "status":"pending", "link":"https://your-host/invitation/<token>",
#         "expiresAt":"..." }
```

Rejections to expect:

- Existing account for that email → `409` (FR-004).
- An active pending invite already exists for that email → `409` (FR-005).
- Malformed email / bad role → `400`.
- No admin session → `401`; non-admin session → `403`.

## 2. Redeem the invitation (recipient) — US2

Paste the link into an email and send it to the recipient yourself (no email is sent by the
system, FR-003). The recipient opens the link, sees their email pre-filled and locked, sets a
password (≥12 chars) and a display name, and submits. They are then sent to the sign-in page —
**no session is auto-created** (FR-012).

Equivalent API:

```bash
# Render-the-form lookup (anonymous):
curl http://localhost:8081/api/auth/invitation/<token>
# → 200 { "email":"newperson@example.com" }   (valid, pending; role is NOT returned —
#         removed from the anonymous lookup in red-team Pass 7, since the recipient form
#         needs only the bound email and the granted role is applied server-side at accept)
# → 410 { "error":"This invitation is no longer valid." }        (any invalid case)

# Accept (anonymous; email comes from the invitation, not the body):
curl -X POST http://localhost:8081/api/auth/invitation/accept \
  -H 'Content-Type: application/json' \
  -d '{"token":"<token>","password":"correct horse battery","name":"New Person"}'
# → 200 { "email":"newperson@example.com" }   then sign in normally
```

Then the recipient signs in:

```bash
curl -X POST http://localhost:8081/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"newperson@example.com","password":"correct horse battery"}'
# → 200, session established. Reusing the same invitation link now → 410 (single-use, FR-009).
```

## 3. Manage invitations (admin) — US3

The management screen lists every invitation with email, role, status, creation date, acceptance
date (when accepted), and the creating admin (FR-013/FR-017). For Pending invitations:

- **Re-copy link**: `GET /api/admin/invitations/{id}/link` → the **same** original link (FR-016).
- **Retract**: `POST /api/admin/invitations/{id}/retract` → status becomes Retracted; the link
  stops working immediately (FR-015, SC-004).

Accepted / Expired / Retracted invitations remain listed for history (FR-019).

## 4. Run the tests

```bash
# Unit / controller tests (TDD, watch mode):
yarn test                                   # or: npx jest src/server/auth --runInBand

# Integration tests (real compiled server; better-auth is ESM-only):
yarn test:integration

# E2E (web):
yarn test-e2e
```

Test isolation: invitation rows are written on the isolated auth `pg.Pool`, so
`src/server/jestSetupAfterEnv.ts` now also `DELETE FROM "invitation"` in `afterEach` (alongside
session/verification/rateLimit/account/user). If you see a stale "active pending invite" failure
across tests, that cleanup is what keeps it isolated.

## Acceptance checks (maps to Success Criteria)

- SC-001: create an invite + copy a link in under a minute without leaving the admin area.
- SC-002: open a valid link → account created → directed to sign in, email shown but not editable.
- SC-003: reusing an Accepted link is always rejected (410); never a second account.
- SC-004: retract → link fails on next use.
- SC-005: the list reflects status/dates/creator accurately across all transitions.
- SC-006: a Pending link stops working after 14 days and shows Expired.
- SC-007: all create/manage actions are 401 (unauth) / 403 (non-admin).
- SC-008: public sign-up stays disabled; only valid invites (and the seed admin) create accounts.
- SC-009: desktop behavior and the domain storage driver are unchanged.
