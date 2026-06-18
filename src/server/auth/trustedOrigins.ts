/**
 * trustedOrigins.ts — single source of truth for the BETTER_AUTH_URL default
 * and the dev-port origin allow-list.
 *
 * Both auth.ts (betterAuth trustedOrigins) and invitationController.ts
 * (requireSameOrigin CSRF middleware) must agree on which origins are trusted.
 * Keeping the values here means any change to ports or the default URL is made
 * in exactly one place and is compiler-enforced for every consumer.
 *
 * References: plan.md Pass 4/6, architecture-review remediation task 9c7.13.
 */

/**
 * Fallback base URL used when BETTER_AUTH_URL is not set in the environment.
 * Matches the webpack-dev-server API port used by `yarn dev-web`.
 */
export const DEFAULT_BASE_URL = "http://localhost:8081";

/**
 * The three localhost origins trusted during local development (in the absence
 * of BETTER_AUTH_URL):
 *   :8080 — webpack-dev-server (web frontend, `yarn dev-web`)
 *   :8081 — Express API server
 *   :8082 — webpack-dev-server (desktop frontend, `yarn dev-desktop`)
 */
export const DEV_ORIGINS: ReadonlyArray<string> = [
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
];

/**
 * Returns the allowed origins for the current environment.
 *
 * Logic (mirrors the original inline computation in auth.ts and
 * invitationController.ts, now centralised here):
 *   - BETTER_AUTH_URL set          → trust only that origin
 *   - NODE_ENV === 'development'   → trust all three dev ports
 *   - otherwise                    → trust nothing (null)
 *
 * Returning null in production is safe because secrets.ts already throws at
 * startup when BETTER_AUTH_URL is absent in production.
 */
export function getTrustedOrigins(): string[] | null {
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  if (betterAuthUrl) {
    return [betterAuthUrl];
  }
  if (process.env.NODE_ENV === "development") {
    return [...DEV_ORIGINS];
  }
  return null;
}
