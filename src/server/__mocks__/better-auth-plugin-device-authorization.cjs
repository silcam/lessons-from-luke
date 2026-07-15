/**
 * CJS shim for better-auth/plugins/device-authorization (unit-test context only).
 *
 * better-auth plugins are ESM-only. This shim returns a no-op factory so the
 * unit-test CJS runner can load auth.ts without an "import outside module" error.
 * The real deviceAuthorization plugin is only exercised by integration tests
 * running against a compiled child-process server.
 */
"use strict";

function deviceAuthorization(_opts) {
  return {};
}

module.exports = { deviceAuthorization };
