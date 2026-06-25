/**
 * invitationController.ts — Admin invitation create route + anonymous lookup/accept
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

import crypto from "crypto";
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
} from "../auth/invitationStore";
import {
  AccountAlreadyRegisteredError,
  ActivePendingError,
  InvalidEmailError,
  InvalidRoleError,
  ValidationError,
  InvalidLinkError,
  AccountCreatedConcurrentlyError,
  NotFoundError,
  NotPendingError,
  DecryptError,
} from "../auth/invitationValidation";
import secrets from "../util/secrets";
import { DEFAULT_BASE_URL } from "../auth/trustedOrigins";
import { requireSameOrigin } from "../middle/requireSameOrigin";
import { invitationRateLimit } from "../middle/invitationRateLimit";

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
  // IP-only rate limiter for the accept endpoint (no token available in body at
  // middleware time — the body parser runs after the rate limiter).
  const rateLimiter = invitationRateLimit(pool);

  // Token-scoped secondary rate limiter for the lookup endpoint: keys on
  // SHA-256(token) so each unique token has its own bucket as a graceful
  // degradation if req.ip is ever unreliable (see rate-limit header comment).
  const tokenRateLimiter = invitationRateLimit(pool, (req: Request) => {
    const token = req.params.token ?? "";
    return `invitation-token:${crypto.createHash("sha256").update(token).digest("hex")}`;
  });

  // GET /api/auth/invitation/:token — look up a pending invitation by token
  app.get(
    "/api/auth/invitation/:token",
    tokenRateLimiter,
    requireSameOrigin,
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { token } = req.params;

      let result;
      try {
        result = await lookupInvitation(pool, token);
      } catch (err) {
        next(err);
        return;
      }

      if (!result) {
        res
          .status(410)
          .json({ error: "This invitation link is invalid, expired, or has already been used." });
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
        result = await acceptInvitation(pool, token, password, name);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(400).json({ error: err.message });
          return;
        }
        if (err instanceof InvalidLinkError) {
          res
            .status(410)
            .json({ error: "This invitation link is invalid, expired, or has already been used." });
          return;
        }
        if (err instanceof AccountCreatedConcurrentlyError) {
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
  // Per-IP rate limiter for the admin create route (security: 9c7.12).
  // The admin create endpoint exposes an account-enumeration oracle because it
  // returns a distinct 409 ACCOUNT_EXISTS code. Rate-limiting bounds enumeration
  // speed even for authenticated admins or compromised admin sessions.
  const adminCreateRateLimiter = invitationRateLimit(pool);

  // POST /api/admin/invitations — create an invitation
  // requireAdmin is already applied via app.use('/api/admin', requireAdmin)
  // in serverApp.ts before this controller is mounted.
  app.post(
    "/api/admin/invitations",
    adminCreateRateLimiter,
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { email, role } = req.body as { email?: unknown; role?: unknown };

      if (typeof email !== "string" || typeof role !== "string") {
        res.status(400).json({ error: "email and role are required" });
        return;
      }

      const baseUrl = process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;

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
        if (err instanceof AccountAlreadyRegisteredError) {
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        if (err instanceof ActivePendingError) {
          res.status(409).json({ error: err.message, code: err.code });
          return;
        }
        // Validation errors from createInvitation (InvalidEmailError, InvalidRoleError)
        // forward their .code so the client can map it to a friendly, actionable
        // message. The raw err.message stays in `error` for diagnostics/back-compat.
        if (err instanceof InvalidEmailError || err instanceof InvalidRoleError) {
          res.status(400).json({ error: err.message, code: err.code });
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
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      let summaries;
      try {
        summaries = await listInvitations(pool);
      } catch (err) {
        next(err);
        return;
      }

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
  app.get("/api/admin/invitations/:id/link", async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const baseUrl = process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;

    let link: string;
    try {
      // getInvitationLink returns { link: string }; destructure so the
      // response is a single-level { link } rather than a double-wrapped
      // { link: { link } } (which serialised to "[object Object]" client-side).
      ({ link } = await getInvitationLink(pool, id, baseUrl, secrets.cookieSecret));
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
  });
}
