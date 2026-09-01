/**
 * CJS shim for better-auth/plugins/bearer (unit-test context only).
 *
 * better-auth plugins are ESM-only. This shim returns a no-op factory so the
 * unit-test CJS runner can load auth.ts without an "import outside module" error.
 * The real bearer plugin (which makes getSession() accept Authorization: Bearer
 * <session-token> in addition to cookies) is only exercised by integration tests.
 * Unit-test bearer-auth simulation is handled by the better-auth.cjs mock's
 * getSession() which checks both cookie and Authorization header.
 */
"use strict";

function bearer(_opts) {
  return {};
}

module.exports = { bearer };
