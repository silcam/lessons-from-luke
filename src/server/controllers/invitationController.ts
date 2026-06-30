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
import { getInvitationBaseUrl } from "../auth/trustedOrigins";
import { requireSameOrigin } from "../middle/requireSameOrigin";
import { invitationRateLimit } from "../middle/invitationRateLimit";
import { getEmailTransport } from "../email/getEmailTransport";
import { buildInvitationEmail } from "../email/messages/invitationEmail";

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
  //
  // Intentionally NOT origin-gated (no requireSameOrigin). This is a read-only
  // lookup with no side effect, and its JSON body is unreadable cross-origin
  // under the same-origin policy (the server sets no CORS headers) — so a forced
  // cross-origin GET achieves nothing an honest read would not (plan.md Pass
  // 4/11, which reached this same conclusion for read-only GETs).
  //
  // It MUST stay un-gated: browsers omit the Origin header on a *same-origin*
  // GET (contrary to plan.md Pass 1's assumption that Origin is "always" sent),
  // and helmet's default Referrer-Policy: no-referrer strips the Referer too, so
  // requireSameOrigin would have no signal in production and 403 every real
  // redemption — the redemption page's first call. The token in the path is the
  // capability; tokenRateLimiter still bounds brute force. The state-changing
  // accept POST below keeps requireSameOrigin (POST always sends Origin).
  app.get(
    "/api/auth/invitation/:token",
    tokenRateLimiter,
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
// Per-invitation resend throttle (red-team Pass 1/2 — email-bomb amplifier
// mitigation, data-model.md §rateLimit)
//
// customRules on the better-auth rate-limit plugin are keyed by IP + path,
// which cannot express "no more than N resends of THIS invitation" — an admin
// session (or a compromised one) could otherwise hammer a single invitee's
// inbox via repeated resends while staying under the per-IP invitationRateLimit.
// This performs a manual, atomic GET+SET throttle check against the shared
// `rateLimit` table (the same table better-auth itself uses for
// /sign-in/email and the password-reset request throttle).
//
// `rateLimit.key` carries no unique constraint (verified in auth.ts's
// reset-req throttle), so — exactly like that throttle — this uses a
// read-then-write pattern rather than an atomic `ON CONFLICT` UPSERT.
// ---------------------------------------------------------------------------

const RESEND_THROTTLE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_THROTTLE_MAX = 5;

/**
 * Scoped TTL cleanup for this app's 'resend:' synthetic keys ONLY (Pass 10).
 * A blanket `DELETE ... WHERE "lastRequest" < $cutoff` would also prune
 * better-auth's own `<ip>:/sign-in/email` rows and neuter its brute-force
 * protection, so the WHERE clause is scoped to the 'resend:' prefix.
 */
async function cleanupStaleResendThrottleRows(pool: Pool, nowMs: number): Promise<void> {
  const windowStart = nowMs - RESEND_THROTTLE_WINDOW_MS;
  await pool.query(`DELETE FROM "rateLimit" WHERE "key" LIKE 'resend:%' AND "lastRequest" < $1`, [
    windowStart,
  ]);
}

/**
 * Checks and increments the per-invitation resend counter. Returns true when
 * this request pushes the count over RESEND_THROTTLE_MAX (i.e. the caller
 * should respond 429).
 */
async function isResendThrottled(pool: Pool, invitationId: string): Promise<boolean> {
  const nowMs = Date.now();
  const key = `resend:${invitationId}`;

  await cleanupStaleResendThrottleRows(pool, nowMs);

  const existingResult = await pool.query<{
    id: string;
    count: number;
    lastRequest: bigint | number | string;
  }>(`SELECT id, count, "lastRequest" FROM "rateLimit" WHERE key = $1 LIMIT 1`, [key]);

  const existing = existingResult.rows[0];
  let count: number;

  if (!existing) {
    await pool.query(
      `INSERT INTO "rateLimit" (id, key, count, "lastRequest")
       VALUES (gen_random_uuid()::text, $1, 1, $2)`,
      [key, nowMs]
    );
    count = 1;
  } else if (nowMs - Number(existing.lastRequest) > RESEND_THROTTLE_WINDOW_MS) {
    // Window expired: reset count to 1 (new window).
    await pool.query(`UPDATE "rateLimit" SET count = 1, "lastRequest" = $1 WHERE id = $2`, [
      nowMs,
      existing.id,
    ]);
    count = 1;
  } else {
    // Within window: increment count.
    await pool.query(`UPDATE "rateLimit" SET count = count + 1, "lastRequest" = $1 WHERE id = $2`, [
      nowMs,
      existing.id,
    ]);
    count = existing.count + 1;
  }

  return count > RESEND_THROTTLE_MAX;
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

      const baseUrl = getInvitationBaseUrl();

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

      // Auto-send the invitation email (FR-014/FR-015). A send failure does NOT
      // fail creation — the invitation is still created and returned, just with
      // emailSent: false so the admin knows to use the copyable link or resend
      // (FR-017).
      let emailSent = true;
      try {
        await getEmailTransport().send(
          buildInvitationEmail({ email: result.email, link: result.link })
        );
      } catch (sendErr) {
        console.error("invitationEmail send failed", { to: result.email, error: sendErr });
        emailSent = false;
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
        emailSent,
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
    const baseUrl = getInvitationBaseUrl();

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

  // POST /api/admin/invitations/:id/resend — resend the invitation email for a
  // pending invitation (FR-016). Re-derives the existing link (decrypts the
  // stored tokenEnc; issues no new token and does NOT change expiresAt — edge
  // case "Repeated resend") and re-sends to the bound address. State-changing
  // POST -> requireSameOrigin (Pass 4) + the per-IP invitationRateLimit, PLUS
  // a per-invitation throttle (isResendThrottled) bounding reuse of a single
  // invitation as an inbox-flooding amplifier against the bound invitee
  // (red-team Pass 1/2).
  app.post(
    "/api/admin/invitations/:id/resend",
    adminCreateRateLimiter,
    requireSameOrigin,
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const baseUrl = getInvitationBaseUrl();

      let link: string;
      let email: string;
      try {
        ({ link, email } = await getInvitationLink(pool, id, baseUrl, secrets.cookieSecret));
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

      if (await isResendThrottled(pool, id)) {
        res
          .status(429)
          .json({ error: "Too many resend requests for this invitation. Please try again later." });
        return;
      }

      // A send failure does NOT fail the resend request — emailSent: false
      // tells the admin to retry or fall back to the copyable link, mirroring
      // the create route's FR-017 behaviour.
      let emailSent = true;
      try {
        await getEmailTransport().send(buildInvitationEmail({ email, link }));
      } catch (sendErr) {
        console.error("invitationEmail resend failed", { to: email, error: sendErr });
        emailSent = false;
      }

      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.json({ emailSent });
    }
  );
}
