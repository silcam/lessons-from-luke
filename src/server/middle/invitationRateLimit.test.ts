/// <reference types="jest" />

import { Request } from "express";
import { clientIp } from "./invitationRateLimit";

// Minimal mock req: clientIp only reads req.headers["cf-connecting-ip"] and req.ip.
function mockReq(opts: {
  cf?: string | string[];
  ip?: string;
}): Request {
  const headers: Record<string, string | string[] | undefined> = {};
  if (opts.cf !== undefined) headers["cf-connecting-ip"] = opts.cf;
  return { headers, ip: opts.ip } as unknown as Request;
}

describe("clientIp", () => {
  test("cf-connecting-ip present → returned, trimmed", () => {
    expect(clientIp(mockReq({ cf: "  63.155.24.47 ", ip: "172.64.0.1" }))).toBe(
      "63.155.24.47"
    );
  });

  test("cf-connecting-ip absent → falls back to req.ip", () => {
    expect(clientIp(mockReq({ ip: "203.0.113.9" }))).toBe("203.0.113.9");
  });

  test("both present → cf-connecting-ip wins over the edge IP / spoofed req.ip", () => {
    // req.ip is the Cloudflare edge IP (172.64.0.0/13) under trust proxy = 1;
    // the authoritative CF-Connecting-IP must take precedence.
    expect(clientIp(mockReq({ cf: "63.155.24.47", ip: "172.64.0.1" }))).toBe(
      "63.155.24.47"
    );
  });

  test("cf-connecting-ip as string[] → first element (trimmed)", () => {
    expect(
      clientIp(mockReq({ cf: [" 63.155.24.47 ", "8.8.8.8"], ip: "172.64.0.1" }))
    ).toBe("63.155.24.47");
  });

  test("whitespace-only cf-connecting-ip → falls back to req.ip", () => {
    expect(clientIp(mockReq({ cf: "   ", ip: "203.0.113.9" }))).toBe("203.0.113.9");
  });

  test("neither cf-connecting-ip nor req.ip → 'unknown'", () => {
    expect(clientIp(mockReq({}))).toBe("unknown");
  });
});
