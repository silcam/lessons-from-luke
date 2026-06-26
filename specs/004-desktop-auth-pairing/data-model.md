# Phase 1 Data Model: Desktop Auth Pairing + Shared-API Enforcement

**Feature**: `004-desktop-auth-pairing` | **Date**: 2026-06-25

All persisted entities live on the **server-only auth pool** (`getAuthPool()`), under the
constitution Principle VI server-only-infrastructure exemption — they are never imported into the
isomorphic `core` or the desktop offline path. The desktop holds only an opaque encrypted token
locally. There is **no new domain data** and **no `Persistence`-interface change**.

---

## Entity 1: `deviceCode` (NEW table, owned by the better-auth device-authorization plugin)

A short-lived attempt to connect one desktop (spec "Device pairing request"). The plugin defines
the schema (`device-authorization/schema.mjs`); we add a migration that creates the matching table.

| Field             | Type        | Req | Notes                                                                                                                 |
| ----------------- | ----------- | --- | --------------------------------------------------------------------------------------------------------------------- |
| `id`              | text PK     | yes | plugin-generated id                                                                                                   |
| `deviceCode`      | text        | yes | the desktop's polling secret. **Never exposed to the browser or any URL** (FR-007). Looked up on `/device/token`.     |
| `userCode`        | text        | yes | the short human code shown by the desktop and typed in the browser, e.g. `WDJB-MJHT`. Looked up on `/device/approve`. |
| `userId`          | text        | no  | NULL until approval; set to the approving user's id by `/device/approve`. Binds the credential (FR-005).              |
| `expiresAt`       | timestamptz | yes | now + `expiresIn` (10 min). Past-expiry → `expired_token` and row delete.                                             |
| `status`          | text        | yes | `pending` → `approved` / `denied`. Drives `/device/token` responses.                                                  |
| `lastPolledAt`    | timestamptz | no  | updated each `/device/token` poll; enforces `slow_down`.                                                              |
| `pollingInterval` | number      | no  | echoes the configured `interval` (5 s).                                                                               |
| `clientId`        | text        | no  | the desktop client identifier sent on `/device/code`.                                                                 |
| `scope`           | text        | no  | unused in v1 (no scopes).                                                                                             |

**Lifecycle / state transitions** (enforced by the plugin; two-step web flow required):

```
created(pending, userId=null)
       │
       ├── GET /device?user_code=XXXX (DeviceLinkPage mount, auth'd browser)
       │       ── sets userId on row (the "claim" step) ──▶ pending, userId=<user>
       │                │
       │                ├── POST /device/approve ──▶ approved ──POST /device/token──▶ session issued, row DELETED
       │                └── POST /device/deny    ──▶ denied   ──POST /device/token──▶ access_denied, row DELETED
       │
       └── expiresAt ≤ now ──▶ POST /device/token ──▶ expired_token, row DELETED

NOTE: POST /device/approve fails with DEVICE_CODE_NOT_CLAIMED if GET /device was not called first
(userId is still null). DeviceLinkPage MUST call GET /device on mount before rendering the form.
```

**Validation rules** (plugin-provided, mapped to spec):

- Single-use: row is deleted on successful token exchange (FR-006, SC-008).
- Short-lived: expiry checked on every poll (FR-006).
- Wrong party: `userId` is whoever approved in the browser; a non-intended user approving consumes
  the code and binds it to themselves, never silently to the desktop's intended account (FR-007).
- Poll throttling: `slow_down` if polled faster than `pollingInterval`.

**Indexes** (in the migration): unique/lookup index on `deviceCode`, lookup index on `userCode`.

**Row cleanup / unbounded-growth guard** (red-team, see plan.md Performance): the plugin only
deletes a row during a poll/redemption — an **abandoned** pairing (requested but never polled) and
anonymous-flood rows are never reaped and grow the table without bound. Add a periodic sweep of
`expiresAt < now` rows (startup + opportunistic). On admin revoke-by-user, also delete **all** of
that user's `deviceCode` rows **regardless of status** — `DELETE FROM "deviceCode" WHERE "userId" =
$1`, not a `status = 'pending'` filter (red-team Security hygiene). The dangerous row is an
`approved`-but-not-yet-redeemed one: if it survives the revoke, the device's next `/device/token`
poll mints a fresh session and re-grants the just-revoked access. Deleting only `pending` rows would
leave that bypass open. **Order the deletes** to avoid a race: delete the `deviceCode` rows **before**
the `session` rows (or wrap both in one transaction), so a poll arriving between the two deletes
finds no redeemable code and cannot create a surviving session.

---

## Entity 2: Device credential — reuses the existing `session` table (NO new table)

The credential a desktop holds after pairing **is a better-auth session** (research R2). Relevant
existing columns:

| Field                     | Notes                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `id` / `token`            | `token` is the bearer credential the desktop stores and sends as `Authorization: Bearer <token>`. |
| `userId`                  | the paired user. A user may hold many sessions → many devices (spec: "more than one device").     |
| `expiresAt`               | 60-day sliding expiry (research R3); refreshed within `updateAge` on use.                         |
| `createdAt` / `updatedAt` | renewal bookkeeping.                                                                              |
| `ipAddress` / `userAgent` | better-auth metadata; not used to distinguish device vs web in v1.                                |

**States**: _active_ (row exists, not expired) → _revoked_ (row deleted by admin revoke or self
sign-out) / _expired_ (`expiresAt ≤ now`, treated as no session). The gate's `getSession` returns
null for revoked/expired → 401 on next online request (FR-017, SC-005, edge case "credential
revoked/expired").

**Why no separate credential table**: session == credential gives existence, expiry/renewal,
self-disconnect (sign-out deletes the row), and admin revoke (delete the user's rows) with no extra
schema (constitution VII). Distinguishing device sessions from web sessions is a deferred
enhancement (research R8).

---

## Entity 3: Desktop-local credential store (NEW, on-device, not a DB)

The opaque bearer token at rest on the desktop.

| Aspect                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location               | a blob (e.g. `credential.bin`) under the existing `LocalStorage` `userData` base path.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Encryption             | Electron `safeStorage` (OS keychain / DPAPI) — `encryptString` on write, `decryptString` on read (research R5).                                                                                                                                                                                                                                                                                                                                                                           |
| In-memory              | decrypted token kept only in the Electron main process; attached as the `Authorization` header by `WebAPIClientForDesktop`.                                                                                                                                                                                                                                                                                                                                                               |
| Cleared by             | Disconnect (FR-016), or on a 401 that proves the credential is dead.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Write safety           | atomic tmp-file rename (reuse `LocalStorage`'s existing pattern).                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Encryption unavailable | **Fail closed** (red-team): if `safeStorage.isEncryptionAvailable()` is false (locked keychain, pre-`app.ready`, Linux without a keyring), do **not** write plaintext — keep the token in memory for the session only and tell the user secure storage is unavailable. A lost laptop must never yield a readable token.                                                                                                                                                                   |
| Read/decrypt failure   | **Resolve to unpaired** (red-team): a previously-written blob can become undecryptable (OS user changed, keychain reset/locked, file copied to another machine) → `decryptString` **throws**. Wrap the startup load in try/catch; on failure discard the unreadable blob and treat the device as unpaired (drop to "Not connected — reconnect", keep working offline). MUST NOT crash the main process or boot-loop. A decrypt failure is treated identically to "no credential present". |

This store is **server-only-auth-free**: it holds an opaque string obtained over HTTP and never
imports better-auth (FR-018).

---

## Entity 4: Desktop connection/auth UI state (NEW, in `SyncState` / Redux, not persisted to DB)

The desktop already has `connected: boolean` meaning **network reachability**. We add an
orthogonal **pairing** dimension so the UI can tell the four states apart (US3):

| New field                                       | Meaning                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `paired: boolean`                               | a credential is present on the device.                                                  |
| `pairedUserName?: string` \| `pairedUserEmail?` | shown as "connected as <user>" (US1.2). Optional, fetched from `/api/auth/get-session`. |

**Derived UI states** (FR-014, FR-015, US3):

| `paired` | network `connected` | UI                                                                                                                                                                                                                        |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| false    | false               | full offline use from cache; passive.                                                                                                                                                                                     |
| false    | true                | "Not connected" + **Connect to account** prompt (no silent sync failure).                                                                                                                                                 |
| true     | true                | syncing as `<user>` (normal).                                                                                                                                                                                             |
| true     | true, but 401       | drop `paired`→false, clear credential, show "Not connected — reconnect". A 401 mid-sync aborts the remaining sync cleanly and leaves the local cache at its last consistent checkpoint (red-team — no half-applied sync). |

**Session keep-alive** (red-team, see plan.md Edge Cases): because SC-002/FR-013 rely on `updateAge`
sliding renewal (Entity 2) which may not slide on plain sync GETs, the desktop when online calls
`GET /api/auth/get-session` with its bearer on a defined cadence (≤ once per `updateAge` window,
~daily) to refresh `expiresAt`, so a desktop that syncs within 60 days never expires.

---

## Entity 5: Enforcement setting (server config, NOT stored data)

| Aspect         | Decision                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Representation | env var `ENFORCE_API_AUTH` (truthy = on), read once at startup (research R9).                   |
| Default        | OFF (FR-009, FR-012, SC-004).                                                                   |
| Effect         | when on, `requireUserWhenEnforced` runs `requireUser` on the gated domain routes (research R7). |

Not domain data; never routed through `Persistence`; not stored in any table.

---

## Relationships

```
user (existing) ──1:N──▶ session (existing; each session = one connected device OR one web login)
user (existing) ──1:N──▶ deviceCode (NEW; transient pairing attempts, deleted on completion/expiry)
session.token ──encrypted at rest──▶ desktop credential store (safeStorage blob)
admin "revoke device access" ──DELETE──▶ all of a user's session rows (FR-017)
```

## Migration

One new migration `<ts>-AddDeviceCodeTable.js`, mirroring `1781767466144-AddInvitationTable.js`:
creates the `deviceCode` table on the auth pool with the plugin's columns plus the `deviceCode` /
`userCode` indexes. The `session`, `user`, `account`, `verification` tables already exist
(`1780760814404-AddBetterAuthTables.js`). No changes to domain tables.
