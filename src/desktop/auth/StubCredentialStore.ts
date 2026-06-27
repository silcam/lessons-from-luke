import { CredentialStore } from "./CredentialStore";

/**
 * Test-only `CredentialStore` that holds a token purely in memory — no disk
 * I/O and no Electron `safeStorage` (which is unavailable under the Xvfb CI
 * runner and would fall back to in-memory anyway).
 *
 * Used by the Playwright Electron e2e suite (via `TestDesktopApp` when
 * `DESKTOP_E2E_TOKEN` is set) to start the desktop in a *paired* state with a
 * real better-auth session token, so the post-pairing sync/translate UI can be
 * exercised without driving the full RFC 8628 device handshake (whose approval
 * UI is browser-side). The unpaired flow is covered separately by the login
 * guard e2e and by `DesktopApp.test.ts`.
 *
 * Extends `CredentialStore` (rather than reimplementing the interface) so it is
 * type-compatible with `DesktopApp`'s constructor — TypeScript compares classes
 * with private members nominally. `super("")` passes an unused base path; every
 * method is overridden to use the in-memory token.
 */
export class StubCredentialStore extends CredentialStore {
  private token: string | null;

  constructor(token: string | null = null) {
    super("");
    this.token = token;
  }

  async load(): Promise<string | null> {
    return this.token;
  }

  async save(token: string): Promise<void> {
    this.token = token;
  }

  async clear(): Promise<void> {
    this.token = null;
  }
}
