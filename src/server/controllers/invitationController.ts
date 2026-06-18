/**
 * invitationController.ts — Admin invitation create route + anonymous lookup/accept + rate limiter
 *
 * Spec: specs/002-invitation-system/spec.md §FR-001..FR-012, §FR-013..FR-019, §FR-020
 * Plan: plan.md §Security Considerations (Pass 1/2/3 rate-limit, Pass 4/6 CSRF,
 *       Pass 5/6 logger, Pass 8 body parser, Pass 10/11 list/retract Cache-Control,
 *       Pass 12 rate-limit flag),
 *       plan.md §Edge Cases (Route registration ordering),
 *       contracts/invitation-api.yaml §/api/admin/invitations POST,
 *       §/api/admin/invitations GET, §/api/admin/invitations/{id}/retract POST,
 *       §/api/admin/invitations/{id}/link GET,
 *       §/api/auth/invitation/{token} GET, §/api/auth/invitation/accept POST
 */

import { Express, Request, Response, NextFunction } from "express";
import bodyParser from "body-parser";
import { Pool } from "pg";
import {
  createInvitation,
  listInvitations,
  retractInvitation,
  getInvitationLink,
  lookupInvitation,
  acceptInvitation,
  AccountExistsError,
  ActivePendingError,
  ValidationError,
  InvalidLinkError,
  AccountAlreadyExistsError,
  NotFoundError,
  NotPendingError,
  DecryptError,
} from "../auth/invitationStore";
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
// Rate limiter middleware (plan.md Pass 1/2/3/12)
//
// Stores per-IP request counts in the invitationRateLimit table:
//   key text PK, count int, lastRequest bigint (milliseconds since epoch)
//
// Atomic UPSERT with window-based reset:
//   If lastRequest < windowStart → reset count to 1 (new window)
//   Otherwise → increment count
//   Returns count; if count > RATE_LIMIT_MAX → 429
//
// Enforced when: NODE_ENV !== 'test' || BETTER_AUTH_ENFORCE_RATE_LIMIT === '1'
// Key = 'invitation:' + req.ip (trust proxy=1 is set in serverApp.ts)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 seconds
const RATE_LIMIT_MAX = 10;

/**
 * Creates an Express middleware that enforces a per-IP rate limit on invitation
 * routes using the invitationRateLimit table.
 *
 * Skipped when NODE_ENV=test AND BETTER_AUTH_ENFORCE_RATE_LIMIT !== '1',
 * mirroring the existing BETTER_AUTH_ENFORCE_RATE_LIMIT flag (plan.md Pass 12).
 */
export function invitationRateLimit(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip in test mode unless enforcement flag is set
    if (
      process.env.NODE_ENV === "test" &&
      process.env.BETTER_AUTH_ENFORCE_RATE_LIMIT !== "1"
    ) {
      next();
      return;
    }

    const nowMs = Date.now();
    const windowStart = nowMs - RATE_LIMIT_WINDOW_MS;
    const key = `invitation:${req.ip ?? "unknown"}`;

    const client = await pool.connect();
    try {
      // Prune stale entries from previous windows (same round-trip)
      await client.query(
        `DELETE FROM "invitationRateLimit" WHERE "lastRequest" < $1`,
        [windowStart]
      );

      // Atomic UPSERT: insert or increment, resetting count if the window has reset
      const result = await client.query<{ count: number }>(
        `INSERT INTO "invitationRateLimit" (key, count, "lastRequest")
         VALUES ($1, 1, $2)
         ON CONFLICT (key) DO UPDATE SET
           count = CASE
             WHEN "invitationRateLimit"."lastRequest" < $3 THEN 1
             ELSE "invitationRateLimit".count + 1
           END,
           "lastRequest" = $2
         RETURNING count`,
        [key, nowMs, windowStart]
      );

      const count = result.rows[0]?.count ?? 1;

      if (count > RATE_LIMIT_MAX) {
        res.status(429).json({ error: "Too many requests. Please try again later." });
        return;
      }

      next();
    } finally {
      client.release();
    }
  };
}

// ---------------------------------------------------------------------------
// Body parser middleware for /api/auth/invitation/accept (plan.md Pass 8)
//
// Route-scoped bodyParser.json with 4kb limit, mapping parse errors to JSON 400
// rather than HTML (which the global error handler would produce).
// ---------------------------------------------------------------------------

// Cast required: @types/connect's NextHandleFunction is incompatible with
// @types/node's ServerResponse types (same pattern as documentsController.ts).
const acceptJsonParser = bodyParser.json({ limit: "4kb" }) as any;

/**
 * Express error handler middleware: maps SyntaxError (malformed JSON) and
 * PayloadTooLargeError to a JSON 400 response instead of HTML (Pass 8).
 */
function acceptBodyParserErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (
    err instanceof SyntaxError ||
    (typeof err === "object" && err !== null && (err as { status?: number }).status === 413)
  ) {
    res.status(400).json({ error: "Invalid or oversized request body" });
    return;
  }
  next(err);
}

// ---------------------------------------------------------------------------
// Invitation controller — anonymous routes (registered in serverApp.ts BEFORE
// the better-auth catch-all app.all('/api/auth/*', ...))
// ---------------------------------------------------------------------------

/**
 * Registers anonymous invitation routes on the Express app.
 * MUST be called before app.all('/api/auth/*', toNodeHandler(...)) in serverApp.ts.
 *
 * The `pool` argument is the auth-owned pg.Pool passed from serverApp.ts.
 */
export function registerAnonymousInvitationRoutes(app: Express, pool: Pool): void {
  const rateLimiter = invitationRateLimit(pool);

  // GET /api/auth/invitation/:token — look up a pending invitation by token
  app.get(
    "/api/auth/invitation/:token",
    rateLimiter,
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { token } = req.params;

      const result = await lookupInvitation(pool, token);

      if (!result) {
        res.status(410).json({ error: "This invitation link is invalid, expired, or has already been used." });
        return;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({ email: result.email });
    }
  );

  // POST /api/auth/invitation/accept — accept an invitation and create an account
  app.post(
    "/api/auth/invitation/accept",
    rateLimiter,
    requireSameOrigin,
    acceptJsonParser,
    acceptBodyParserErrorHandler,
    async (req: Request, res: Response): Promise<void> => {
      const { token, password, name } = req.body as {
        token?: unknown;
        password?: unknown;
        name?: unknown;
      };

      if (typeof token !== "string" || !token) {
        res.status(400).json({ error: "token is required" });
        return;
      }
      if (typeof password !== "string") {
        res.status(400).json({ error: "password is required" });
        return;
      }
      if (typeof name !== "string") {
        res.status(400).json({ error: "name is required" });
        return;
      }

      let result;
      try {
        result = await acceptInvitation(pool, token, password, name, secrets.cookieSecret);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(400).json({ error: err.message });
          return;
        }
        if (err instanceof InvalidLinkError) {
          res.status(410).json({ error: "This invitation link is invalid, expired, or has already been used." });
          return;
        }
        if (err instanceof AccountAlreadyExistsError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }

      res.setHeader("Cache-Control", "no-store");
      res.json({ email: result.email });
    }
  );
}

// ---------------------------------------------------------------------------
// Invitation controller — admin routes
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
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        if (err instanceof ActivePendingError) {
          res.status(409).json({ error: err.message, code: err.code });
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

  // GET /api/admin/invitations — list all invitations (FR-013, FR-014)
  // No CSRF check needed — read-only GET (plan.md Pass 4 note)
  app.get(
    "/api/admin/invitations",
    async (req: Request, res: Response): Promise<void> => {
      const summaries = await listInvitations(pool);

      // Set Cache-Control: no-store (plan.md Pass 10 — largest PII surface)
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json(
        summaries.map((s) => ({
          id: s.id,
          email: s.email,
          role: s.role,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          acceptedAt: s.acceptedAt ? s.acceptedAt.toISOString() : null,
          invitedByEmail: s.invitedByEmail,
        }))
      );
    }
  );

  // POST /api/admin/invitations/:id/retract — retract a pending invitation (FR-015)
  // Apply CSRF middleware (state-changing POST — plan.md Pass 4)
  app.post(
    "/api/admin/invitations/:id/retract",
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;

      let summary;
      try {
        summary = await retractInvitation(pool, id);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).json({ error: "Invitation not found" });
          return;
        }
        if (err instanceof NotPendingError) {
          res.status(409).json({ error: "Invitation is not pending" });
          return;
        }
        throw err;
      }

      // Set Cache-Control: no-store (plan.md Pass 11)
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({
        id: summary.id,
        email: summary.email,
        role: summary.role,
        status: summary.status,
        createdAt: summary.createdAt.toISOString(),
        expiresAt: summary.expiresAt.toISOString(),
        acceptedAt: summary.acceptedAt ? summary.acceptedAt.toISOString() : null,
        invitedByEmail: summary.invitedByEmail,
      });
    }
  );

  // GET /api/admin/invitations/:id/link — re-copy a pending invitation's link (FR-016)
  // No CSRF check — read-only GET; same-origin fetch prevents cross-origin body reads
  // (plan.md Pass 4)
  app.get(
    "/api/admin/invitations/:id/link",
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:8081";

      let link;
      try {
        link = await getInvitationLink(pool, id, baseUrl, secrets.cookieSecret);
      } catch (err) {
        if (err instanceof NotFoundError) {
          res.status(404).json({ error: "Invitation not found" });
          return;
        }
        if (err instanceof NotPendingError) {
          res.status(409).json({ error: "Invitation is not pending" });
          return;
        }
        if (err instanceof DecryptError) {
          res.status(409).json({ error: "Link unavailable" });
          return;
        }
        throw err;
      }

      // Set Cache-Control: no-store (plan.md Pass 7)
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({ link });
    }
  );
}
