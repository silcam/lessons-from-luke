import {
  DEFAULT_BASE_URL,
  DEFAULT_WEB_APP_URL,
  getInvitationBaseUrl,
  getWebAppBaseUrl,
  getTrustedOrigins,
} from "./trustedOrigins";

describe("trustedOrigins", () => {
  // ---------------------------------------------------------------------------
  // getInvitationBaseUrl() — base for user-facing /invitation/<token> links.
  //
  // In dev the web app is served by webpack-dev-server on :8080 (the API/auth
  // server is on :8081), so the link must point at the web app, not the API.
  // In production BETTER_AUTH_URL is the shared web/API origin.
  // ---------------------------------------------------------------------------
  describe("getInvitationBaseUrl()", () => {
    // Save/restore BETTER_AUTH_URL so we don't leak env state across tests.
    const savedEnv = process.env.BETTER_AUTH_URL;

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = savedEnv;
      }
    });

    it("returns BETTER_AUTH_URL when it is set", () => {
      process.env.BETTER_AUTH_URL = "https://app.example.org";
      expect(getInvitationBaseUrl()).toBe("https://app.example.org");
    });

    it("falls back to the dev web-app origin (:8080) when BETTER_AUTH_URL is unset", () => {
      delete process.env.BETTER_AUTH_URL;
      expect(getInvitationBaseUrl()).toBe(DEFAULT_WEB_APP_URL);
      expect(getInvitationBaseUrl()).toBe("http://localhost:8080");
    });

    it("does NOT fall back to the API/auth server port (:8081 = DEFAULT_BASE_URL)", () => {
      delete process.env.BETTER_AUTH_URL;
      expect(getInvitationBaseUrl()).not.toBe(DEFAULT_BASE_URL);
    });
  });

  // ---------------------------------------------------------------------------
  // getWebAppBaseUrl() — base for user-facing password-reset links (US1).
  //
  // Alias of getInvitationBaseUrl(): both resolve user-facing links through the
  // same public origin. Password-reset links MUST use this function (not the
  // better-auth `url` arg) to prevent open-redirect / phishing (Pass 1).
  // ---------------------------------------------------------------------------
  describe("getWebAppBaseUrl()", () => {
    // Save/restore BETTER_AUTH_URL so we don't leak env state across tests.
    const savedEnv = process.env.BETTER_AUTH_URL;

    afterEach(() => {
      if (savedEnv === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = savedEnv;
      }
    });

    it("returns BETTER_AUTH_URL in production (same value as getInvitationBaseUrl)", () => {
      process.env.BETTER_AUTH_URL = "https://app.example.org";
      expect(getWebAppBaseUrl()).toBe("https://app.example.org");
      // Must agree with getInvitationBaseUrl (both serve user-facing links from the same origin)
      expect(getWebAppBaseUrl()).toBe(getInvitationBaseUrl());
    });

    it("returns the webpack-dev-server origin (:8080) in development when BETTER_AUTH_URL is unset", () => {
      delete process.env.BETTER_AUTH_URL;
      expect(getWebAppBaseUrl()).toBe(DEFAULT_WEB_APP_URL);
      expect(getWebAppBaseUrl()).toBe("http://localhost:8080");
    });

    it("does NOT return the API/auth server port (:8081) when BETTER_AUTH_URL is unset", () => {
      delete process.env.BETTER_AUTH_URL;
      expect(getWebAppBaseUrl()).not.toBe(DEFAULT_BASE_URL);
    });
  });

  // ---------------------------------------------------------------------------
  // Port constants: the web app and the API/auth server live on distinct dev
  // ports, and both belong to the dev allow-list.
  // ---------------------------------------------------------------------------
  describe("dev port constants", () => {
    it("uses :8080 for the web app and :8081 for the API/auth server", () => {
      expect(DEFAULT_WEB_APP_URL).toBe("http://localhost:8080");
      expect(DEFAULT_BASE_URL).toBe("http://localhost:8081");
    });

    it("includes both the web and API origins in getTrustedOrigins() during dev", () => {
      const savedEnv = process.env.BETTER_AUTH_URL;
      const savedNodeEnv = process.env.NODE_ENV;
      try {
        delete process.env.BETTER_AUTH_URL;
        process.env.NODE_ENV = "development";
        const origins = getTrustedOrigins();
        expect(origins).toContain(DEFAULT_WEB_APP_URL);
        expect(origins).toContain(DEFAULT_BASE_URL);
      } finally {
        if (savedEnv === undefined) {
          delete process.env.BETTER_AUTH_URL;
        } else {
          process.env.BETTER_AUTH_URL = savedEnv;
        }
        process.env.NODE_ENV = savedNodeEnv;
      }
    });
  });
});
