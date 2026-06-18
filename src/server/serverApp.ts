import express from "express";
import helmet from "helmet";
import bodyParser from "body-parser";
import { toNodeHandler } from "better-auth/node";
import languagesController from "./controllers/languagesController";
import lessonsController from "./controllers/lessonsController";
import { requireAdmin } from "./middle/requireUser";
import tStringsController from "./controllers/tStringsController";
import testController from "./controllers/testController";
import documentsController from "./controllers/documentsController";
import invitationController, {
  registerAnonymousInvitationRoutes,
} from "./controllers/invitationController";
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

  app.set("trust proxy", 1);

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
          styleSrc: ["'self'"],
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
    app.use(express.static("dist/frontend"));
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

  if (process.env.NODE_ENV === "test") {
    testController(app, storage as PGTestStorage);
  }

  if (PRODUCTION) {
    // Handle client-side routes
    app.get("*", (req, res) => {
      res.sendFile(`${process.cwd()}/dist/frontend/index.html`);
    });
  }

  return app;
}

export default serverApp;
