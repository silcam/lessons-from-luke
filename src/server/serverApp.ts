import express from "express";
import helmet from "helmet";
import crypto from "crypto";
import fs from "fs";
import bodyParser from "body-parser";
import { toNodeHandler } from "better-auth/node";
import languagesController from "./controllers/languagesController";
import lessonsController from "./controllers/lessonsController";
import { requireAdmin } from "./middle/requireUser";
import normalizeForwardedProto from "./middle/normalizeForwardedProto";
import tStringsController from "./controllers/tStringsController";
import testController from "./controllers/testController";
import documentsController from "./controllers/documentsController";
import invitationController, {
  registerAnonymousInvitationRoutes,
} from "./controllers/invitationController";
import usersController from "./controllers/usersController";
import PGStorage, { PGTestStorage, PGDevStorage } from "./storage/PGStorage";
import { Persistence } from "../core/interfaces/Persistence";
import docStorage from "./storage/docStorage";
import syncController from "./controllers/syncController";
import { getAuth, getAuthPool } from "./auth/auth";

const PRODUCTION = process.env.NODE_ENV == "production";

function serverApp(opts: { silent?: boolean; storage?: Persistence } = {}) {
  const app = express();
  const storage =
    opts.storage ??
    (PRODUCTION
      ? new PGStorage()
      : process.env.NODE_ENV === "test"
        ? new PGTestStorage()
        : new PGDevStorage());

  if (!opts.storage && !PRODUCTION && !opts.silent) {
    const cls = process.env.NODE_ENV === "test" ? "PGTestStorage" : "PGDevStorage";
    console.log(`[serverApp] NODE_ENV=${process.env.NODE_ENV} storage=${cls}`);
  }

  // Trust one proxy hop for req.protocol/req.ip. Under the deployed topology —
  // Cloudflare in front of Phusion Passenger — there are TWO hops and BOTH
  // APPEND to X-Forwarded-For, so req.ip resolves to a Cloudflare EDGE IP
  // (172.64.0.0/13), not the real client. We deliberately keep this at 1 rather
  // than `trust proxy = 2`: bumping the hop count only yields the real client IP
  // if ingress is ALSO firewalled to Cloudflare's published ranges (otherwise
  // req.ip becomes spoofable), which would couple the app to infra it can't
  // enforce.
  //
  // Instead, both IP-sensitive consumers read Cloudflare's authoritative,
  // non-spoofable CF-Connecting-IP header directly — falling back to req.ip /
  // x-forwarded-for when Cloudflare is absent — so they are independent of this
  // setting:
  //   - invitation rate limiter: clientIp() in util/clientIp.ts
  //   - better-auth rate limiting: ipAddressHeaders in auth/auth.ts
  // Keep those two header orderings in sync so the limiters never key on
  // different identities.
  //
  // Residual risk: a client reaching the origin DIRECTLY (bypassing Cloudflare)
  // could forge CF-Connecting-IP. Mitigate at the infra layer by firewalling
  // ingress to Cloudflare's published IP ranges (follow-up; out of scope for
  // this code change).
  app.set("trust proxy", 1);

  // Normalize a doubled X-Forwarded-Proto at the trust boundary. Cloudflare and
  // Passenger each APPEND their scheme, so the app sees "https, https"; left
  // unchanged, better-auth's toNodeHandler (which reads the RAW req.headers)
  // builds a malformed base URL like "https, https://host". This must run first
  // — before the CSP-nonce middleware and crucially before the terminal auth
  // handler below — so the normalized header reaches better-auth's fromNodeHeaders.
  app.use(normalizeForwardedProto);

  // Per-request CSP nonce. styled-components injects its CSS as runtime <style>
  // tags, which the Content-Security-Policy below would otherwise block (we keep
  // style-src free of 'unsafe-inline'). Each request gets a fresh nonce that is
  // advertised in the style-src directive (see below) and stamped onto the served
  // HTML (see the production catch-all) so the SPA can hand it to styled-components.
  // Must run before helmet so the directive function can read res.locals.cspNonce.
  app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
    next();
  });

  // HTTP security headers — helmet must be registered before any route handlers.
  // Cast required: helmet v8 types use Node IncomingMessage/ServerResponse while
  // Express app.use() expects its own RequestHandler type.
  app.use(
    helmet({
      // HSTS: production only (avoids breaking plain-HTTP dev/test environments)
      hsts: PRODUCTION ? { maxAge: 31536000, includeSubDomains: true } : false,
      // Prevent clickjacking: deny framing from other origins
      frameguard: { action: "sameorigin" },
      // Prevent MIME-type sniffing
      noSniff: true,
      // Baseline Content-Security-Policy scoped to the SPA
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // Allow styled-components' runtime <style> tags via a per-request
          // nonce instead of the blanket 'unsafe-inline'.
          styleSrc: [
            "'self'",
            (_req, res) => `'nonce-${(res as express.Response).locals.cspNonce}'`,
          ],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
    }) as any
  );

  // Anonymous invitation routes (/api/auth/invitation/*) are registered HERE,
  // BEFORE the better-auth catch-all, so they are not swallowed by it.
  // The admin route (/api/admin/invitations POST) is mounted below (after bodyParser)
  // and inherits requireAdmin from app.use('/api/admin', requireAdmin) below.
  registerAnonymousInvitationRoutes(app, getAuthPool());
  app.all("/api/auth/*", toNodeHandler(getAuth()) as any);
  app.use(bodyParser.json({ limit: "2MB" }) as any);
  app.use("/api/admin", requireAdmin);

  if (PRODUCTION) {
    // index:false so "/" falls through to the nonce-injecting catch-all below
    // rather than being served as an un-nonced static index.html.
    app.use(express.static("dist/frontend", { index: false }));
  }

  app.use("/webified", express.static(docStorage.webifyPath()));

  // Simulate slow server
  // app.use((res, req, next) => {
  //   setTimeout(next, 1000);
  // });

  if (!opts.silent) {
    // Logger redaction (plan.md Pass 5/6): the production SPA catch-all
    // app.get("*") logs GET /invitation/<raw-token>, leaking the token.
    // Defensively also redact /api/auth/invitation/<token> in case a future
    // refactor moves those routes after the logger.
    const TOKEN_PATH_REDACT = /^\/(api\/auth\/)?invitation\/[^/]+$/;
    app.use((req, res, next) => {
      res.on("finish", () => {
        const logPath = TOKEN_PATH_REDACT.test(req.path)
          ? req.path.replace(/\/[^/]+$/, "/[redacted]")
          : req.path;
        console.log(`${req.method} ${logPath} => [${res.statusCode}]`);
      });
      next();
    });
  }

  languagesController(app, storage);
  lessonsController(app, storage);
  tStringsController(app, storage);
  documentsController(app, storage);
  syncController(app, storage);
  invitationController(app, getAuthPool());
  usersController(app, getAuthPool());

  if (process.env.NODE_ENV === "test") {
    testController(app, storage as PGTestStorage);
  }

  if (PRODUCTION) {
    // Serve the SPA shell for client-side routes, injecting the per-request CSP
    // nonce into the document head as a <meta> tag. webApp.tsx reads it and wires
    // it into styled-components (via __webpack_nonce__) so its runtime <style>
    // tags satisfy the style-src nonce. The built HTML is read once and cached;
    // only the nonce varies per request.
    const indexHtmlPath = `${process.cwd()}/dist/frontend/index.html`;
    let indexHtmlTemplate: string | null = null;
    app.get("*", (req, res) => {
      try {
        if (indexHtmlTemplate === null) {
          indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf8");
        }
        const nonce = res.locals.cspNonce as string;
        // base64 contains no HTML metacharacters, so it is safe to interpolate.
        const metaTag = `<meta name="csp-nonce" content="${nonce}">`;
        const html = indexHtmlTemplate.includes("<head>")
          ? indexHtmlTemplate.replace("<head>", `<head>${metaTag}`)
          : `${metaTag}${indexHtmlTemplate}`;
        res.type("html").send(html);
      } catch {
        res.status(500).send("Internal Server Error");
      }
    });
  }

  return app;
}

export default serverApp;
