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
