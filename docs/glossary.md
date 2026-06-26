# Glossary

The Ubiquitous Language for Lessons from Luke. Each domain concept has exactly one
canonical term. See `.claude/skills/glossary` for how this file is maintained.

## Terms

**AuthGate** (noun): The web-only React guard component that enforces authentication on
gated routes. It consults the existing current-user session state, waits for session-load
completion, and either renders the requested route or redirects an unauthenticated visitor
to the sign-in page while preserving the intended destination. Lives in the web router; the
desktop tree never renders it. [See: gated-route, public-allowlist, intended-destination]

**Public allowlist** (noun): The explicit, named set of web routes reachable without
authentication. For this feature it consists of exactly the sign-in page and the
invitation-redemption route (`/invitation/:token`). A route is public only if it is on this
list (default-deny). [See: gated-route, AuthGate]

**Gated route** (noun): Any web route not on the public allowlist; rendering it requires an
authenticated user. Newly added web routes are gated by default. [See: public-allowlist]

**Intended destination** (noun): The in-app route (path plus path parameters) a signed-out
visitor originally requested, preserved across the sign-in redirect so the user is returned
to it after authenticating. Constrained to same-app relative paths to prevent open-redirect.
[See: AuthGate]

**Default-deny** (adjective): The gating policy in which web routes are protected unless
explicitly added to the public allowlist, so omission fails safe (toward requiring auth).
[See: public-allowlist]

**Device pairing** (noun): The code-based browser handshake that connects one desktop
installation to a user account. The desktop shows a pairing code and opens the browser; the
signed-in user enters the code and approves; the desktop, which is polling, receives a device
credential bound to that user. Uses only outbound calls from the desktop (no loopback server,
no custom URL scheme). [See: pairing-code, device-credential]

**Pairing code** (noun): The short, human-readable, single-use, short-lived code the desktop
displays and the user enters/pastes in the browser to authorize a device pairing. Distinct from
the desktop's polling secret, which is never shown in the browser. [See: device-pairing]

**Device credential** (noun): The bearer-style, revocable credential a desktop holds after a
successful pairing. Bound to the approving user, presented on shared-API requests to identify
the connected user, and invalidated either by the desktop (self sign-out on Disconnect) or by an
admin (revoke a user's device access). [See: device-pairing, shared-api, api-auth-enforcement]

**Shared API** (noun): The domain `/api/*` data routes (languages, lessons, tStrings, sync) used
by both the web and desktop clients. Distinct from the `/api/auth/*` authentication routes.
[See: api-auth-enforcement]

**API auth enforcement** (noun): The server policy — controlled by a flag that defaults to off —
that requires an authenticated identity (a web session or a device credential) on shared-API
requests and rejects anonymous callers. [See: shared-api, device-credential]
