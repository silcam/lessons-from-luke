/**
 * requireSameOrigin.ts — CSRF / same-origin middleware for state-changing invitation routes
 *
 * Spec: specs/002-invitation-system/spec.md §Security Considerations (Pass 4/6)
 * Plan: plan.md Pass 4/6
 *
 * Allow-list logic mirrors auth.ts `trustedOrigins` exactly so they cannot drift:
 *   - BETTER_AUTH_URL set → allow only that origin
 *   - NODE_ENV=development (and BETTER_AUTH_URL unset) → allow dev ports
 *   - NODE_ENV=test (and BETTER_AUTH_ENFORCE_ORIGIN !== '1') → skip check
 *   - otherwise → deny
 *
 * Check Origin first; fall back to Referer; reject 403 if neither matches
 * or neither is present.
 */

import { Request, Response, NextFunction } from "express";
import { getTrustedOrigins } from "../auth/trustedOrigins";

/**
 * Returns the allowed origins for the current environment.
 *
 * Delegates to getTrustedOrigins() from trustedOrigins.ts so this middleware
 * and auth.ts's betterAuth trustedOrigins config can never drift apart
 * (architecture-review remediation 9c7.13; plan.md Pass 6).
 */
function getAllowedOrigins(): string[] | null {
  // Production with no BETTER_AUTH_URL → allow nothing (secrets.ts already
  // throws at startup if BETTER_AUTH_URL is absent in production)
  return getTrustedOrigins();
}

/**
 * Express middleware: validates the Origin (or Referer) header against the
 * BETTER_AUTH_URL allow-list for state-changing invitation routes.
 *
 * Skipped when NODE_ENV=test AND BETTER_AUTH_ENFORCE_ORIGIN !== '1', so the
 * normal Jest suite can exercise the routes without spoofing a browser Origin.
 * The integration test server sets BETTER_AUTH_ENFORCE_ORIGIN=1 to exercise
 * the live CSRF check (plan.md Pass 4/6).
 */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  // Skip in test mode unless integration flag is set
  if (process.env.NODE_ENV === "test" && process.env.BETTER_AUTH_ENFORCE_ORIGIN !== "1") {
    next();
    return;
  }

  const allowedOrigins = getAllowedOrigins();

  // No allowed origins configured → reject all (production misconfiguration
  // is caught at startup by secrets.ts; this is a belt-and-suspenders guard)
  if (!allowedOrigins || allowedOrigins.length === 0) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Prefer Origin header; fall back to Referer
  const origin = req.headers.origin;
  let candidate: string | undefined;

  if (origin) {
    candidate = origin;
  } else {
    const referer = req.headers.referer;
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        candidate = refererUrl.origin;
      } catch {
        // Malformed Referer → treat as absent
      }
    }
  }

  if (!candidate) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Strip trailing slash from candidate for comparison
  const normalizedCandidate = candidate.replace(/\/$/, "");
  const allowed = allowedOrigins.some((o) => o.replace(/\/$/, "") === normalizedCandidate);

  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
