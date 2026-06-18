/**
 * invitationController.ts — Admin invitation create route + shared CSRF middleware
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-006, §FR-020
 * Plan: plan.md §Security Considerations (Pass 4/6 CSRF, Pass 5/6 logger),
 *       plan.md §Edge Cases (Route registration), contracts/invitation-api.yaml
 *       §POST /api/admin/invitations
 */

import { Express, Request, Response, NextFunction } from "express";
import { Pool } from "pg";
import { createInvitation, AccountExistsError, ActivePendingError } from "../auth/invitationStore";
import secrets from "../util/secrets";

// ---------------------------------------------------------------------------
// Shared Origin / CSRF middleware (plan.md Pass 4/6)
//
// Allow-list logic mirrors auth.ts `trustedOrigins` exactly so they cannot drift:
//   - BETTER_AUTH_URL set → allow only that origin
//   - NODE_ENV=development (and BETTER_AUTH_URL unset) → allow dev ports
//   - NODE_ENV=test (and BETTER_AUTH_ENFORCE_ORIGIN !== '1') → skip check
//   - otherwise → deny
//
// Check Origin first; fall back to Referer; reject 403 if neither matches
// or neither is present.
// ---------------------------------------------------------------------------

/**
 * Returns the allowed origins for the current environment, mirroring
 * auth.ts's `trustedOrigins` computation exactly (plan.md Pass 6).
 */
function getAllowedOrigins(): string[] | null {
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  if (betterAuthUrl) {
    return [betterAuthUrl];
  }
  if (process.env.NODE_ENV === "development") {
    return ["http://localhost:8080", "http://localhost:8081", "http://localhost:8082"];
  }
  // Production with no BETTER_AUTH_URL → allow nothing (secrets.ts already
  // throws at startup if BETTER_AUTH_URL is absent in production)
  return null;
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

// ---------------------------------------------------------------------------
// Invitation controller
// ---------------------------------------------------------------------------

/**
 * Registers invitation admin routes on the Express app.
 *
 * The `pool` argument is the auth-owned pg.Pool (same pool that better-auth
 * uses — passed in from serverApp.ts so this module stays free of singletons).
 */
export default function invitationController(app: Express, pool: Pool): void {
  // POST /api/admin/invitations — create an invitation
  // requireAdmin is already applied via app.use('/api/admin', requireAdmin)
  // in serverApp.ts before this controller is mounted.
  app.post(
    "/api/admin/invitations",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { email, role } = req.body as { email?: unknown; role?: unknown };

      if (typeof email !== "string" || typeof role !== "string") {
        res.status(400).json({ error: "email and role are required" });
        return;
      }

      const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:8081";

      let result;
      try {
        result = await createInvitation(pool, {
          email,
          role,
          invitedBy: req.user?.id ?? "unknown",
          baseUrl,
          cookieSecret: secrets.cookieSecret,
        });
      } catch (err) {
        if (err instanceof AccountExistsError) {
          res.status(409).json({ error: err.message });
          return;
        }
        if (err instanceof ActivePendingError) {
          res.status(409).json({ error: err.message });
          return;
        }
        // Validation errors from createInvitation (InvalidEmailError, InvalidRoleError)
        // have a .code property we can check — or just check the name
        if (
          err instanceof Error &&
          (err.name === "InvalidEmailError" || err.name === "InvalidRoleError")
        ) {
          res.status(400).json({ error: err.message });
          return;
        }
        // Unexpected error — rethrow for Express default error handler
        throw err;
      }

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.status(201).json({
        id: result.id,
        email: result.email,
        role: result.role,
        status: result.status,
        link: result.link,
        expiresAt: result.expiresAt.toISOString(),
      });
    }
  );
}
