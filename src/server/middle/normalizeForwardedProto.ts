import { Request, Response, NextFunction } from "express";

/**
 * Express middleware: collapse a doubled `X-Forwarded-Proto` header to its
 * first comma-separated token.
 *
 * Behind two appending proxies (e.g. Cloudflare → Phusion Passenger) each hop
 * *appends* its scheme, so the Node app receives `x-forwarded-proto: "https, https"`.
 * Express collapses this to the first token for its own `req.protocol`, but
 * better-auth's `toNodeHandler` rebuilds a Web `Request` from the *raw*
 * `req.headers` (via `fromNodeHeaders`), so it sees the malformed value and
 * builds a base URL like `"https, https://host"`. We normalize the raw header at
 * the trust boundary — before the auth handler runs — so every downstream
 * consumer sees a single, clean scheme.
 *
 * Keeps "first token" semantics to match Express's own `req.protocol`: the
 * leftmost value is the original client→proxy protocol.
 *
 * No-op when the header is absent (the key is never added). Handles the
 * `string | string[]` shape Node exposes for headers. Mutating `req.headers` is
 * what propagates the fix to better-auth's `fromNodeHeaders`.
 *
 * @param req - Express Request (req.headers mutated in place)
 * @param _res - Express Response (unused)
 * @param next - Express NextFunction
 */
export default function normalizeForwardedProto(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const raw = req.headers["x-forwarded-proto"];
  if (raw === undefined) {
    // Header absent — leave req.headers untouched (don't introduce the key).
    next();
    return;
  }
  // Node exposes a repeated header as string[]; otherwise it's a single string.
  // Either way the leftmost comma-separated token is the original client→proxy
  // protocol; trim surrounding whitespace.
  const value = Array.isArray(raw) ? (raw[0] ?? "") : raw;
  req.headers["x-forwarded-proto"] = value.split(",")[0].trim();
  next();
}
