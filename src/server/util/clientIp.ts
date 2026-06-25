/**
 * clientIp.ts — Authoritative client-IP resolution behind Cloudflare
 *
 * Shared by the invitation rate limiter (middle/invitationRateLimit.ts) and
 * better-auth's ipAddressHeaders (auth/auth.ts) so the two never key on
 * different client identities. See also the trust-proxy comment in serverApp.ts.
 *
 * KEY TRUST MODEL
 * ---------------
 * Under the deployed topology — Cloudflare in front of Phusion Passenger — there
 * are TWO proxy hops and BOTH APPEND to X-Forwarded-For. So under app.set('trust
 * proxy', 1) (serverApp.ts) Express's req.ip resolves to a Cloudflare EDGE IP
 * (172.64.0.0/13), NOT the real client.
 *
 * clientIp() therefore keys on Cloudflare's CF-Connecting-IP header, which
 * Cloudflare sets to the real connecting IP and the client cannot override. We
 * intentionally fall back to req.ip — the trust-proxy-aware value Express has
 * already resolved — rather than the raw, spoofable X-Forwarded-For header, when
 * Cloudflare is absent (dev / supertest, where CF-Connecting-IP is not present,
 * so req.ip is the correct client IP). This is independent of `trust proxy`.
 *
 * The "unknown" literal is a last-ditch guard for the rare case req.ip is
 * undefined; it should not occur in normal request handling.
 *
 * Residual risk: a client connecting DIRECTLY to the origin (bypassing
 * Cloudflare) could set CF-Connecting-IP itself. Mitigate at the infra layer by
 * firewalling ingress to Cloudflare's published IP ranges — out of scope here.
 */

import { Request } from "express";

/** Cloudflare's authoritative, non-spoofable client-IP header name. */
export const CF_CONNECTING_IP = "cf-connecting-ip";

/**
 * Authoritative client IP behind Cloudflare. CF-Connecting-IP is set by
 * Cloudflare to the real connecting IP and cannot be spoofed by the client;
 * it is absent when Cloudflare is off (then req.ip — the trust-proxy-derived
 * value — is correct). Uses req.ip (not raw x-forwarded-for) as the fallback
 * because this in-app helper has the trust-proxy-aware value available, and
 * "unknown" only as a last-ditch guard when req.ip is undefined.
 */
export function clientIp(req: Request): string {
  const cf = req.headers[CF_CONNECTING_IP];
  const value = Array.isArray(cf) ? cf[0] : cf;
  const trimmed = value?.trim();
  return trimmed ? trimmed : (req.ip ?? "unknown");
}
