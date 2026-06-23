/**
 * CJS shim for the `better-auth/react` package (unit-test context only).
 *
 * better-auth/react is an ESM-only package. Jest's CJS runner cannot load it
 * directly. This shim provides a minimal createAuthClient stub so that
 * currentUserSlice.ts can be imported in unit tests.
 *
 * Individual tests mock authClient via:
 *   jest.mock("../../../web/auth/authClient", () => ({ authClient: { ... } }), { virtual: true })
 *
 * So this shim only needs to export createAuthClient — tests never call through
 * to the real authClient.
 */
"use strict";

function createAuthClient() {
  return {
    getSession: async () => null,
    signIn: {
      email: async () => ({ data: null, error: { status: 401, message: "Not implemented" } }),
    },
    signOut: async () => ({}),
  };
}

module.exports = { createAuthClient };
