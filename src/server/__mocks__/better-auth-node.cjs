/**
 * CJS shim for better-auth/node (unit-test context only).
 *
 * better-auth/node is ESM-only. This shim provides:
 * - toNodeHandler: converts a fetch-compatible handler (auth.handler) to a
 *   Node.js (req, res) => void function. Works with both the real better-auth
 *   handler and the stub in better-auth.cjs.
 * - fromNodeHeaders: converts Node.js IncomingHttpHeaders to web-standard Headers.
 *
 * Used by moduleNameMapper in jest.config.js for the "server" unit test project.
 * Integration tests use the real better-auth via a compiled child-process server.
 */
"use strict";

/**
 * Converts Node.js IncomingHttpHeaders to the web-standard Headers object.
 * Mirrors the logic in better-auth/dist/integrations/node.mjs.
 */
function fromNodeHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Converts a body stream (Node.js IncomingMessage) to a string.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Wraps a fetch-compatible handler (auth.handler) into a Node.js
 * (req, res) => Promise<void> function.
 *
 * The stub handler in better-auth.cjs uses the web Fetch API (Request/Response),
 * same as the real better-auth handler. This adapter converts Node's IncomingMessage
 * to a Request and writes the Response back to ServerResponse.
 *
 * For the real handler (integration/production): better-call/node's toNodeHandler
 * is used. For unit tests: this minimal adapter handles the stub.
 */
function toNodeHandler(auth) {
  // Support both { handler } and raw handler function
  const fetchHandler = "handler" in auth ? auth.handler : auth;

  return async function (req, res) {
    try {
      // Build a URL from the request
      const host = req.headers.host || "localhost";
      const protocol = "http";
      const url = `${protocol}://${host}${req.url}`;

      // Read request body
      let bodyText = "";
      if (req.method !== "GET" && req.method !== "HEAD") {
        bodyText = await readBody(req);
      }

      // Build a web-standard Request
      const headers = fromNodeHeaders(req.headers);
      const request = new Request(url, {
        method: req.method,
        headers,
        body: bodyText || undefined,
      });

      // Call the fetch handler
      const response = await fetchHandler(request);

      // Write response status
      res.statusCode = response.status;

      // Write response headers (including Set-Cookie for sessions)
      response.headers.forEach((value, key) => {
        // Handle multiple Set-Cookie headers
        if (key.toLowerCase() === "set-cookie") {
          const existing = res.getHeader("set-cookie");
          if (existing) {
            res.setHeader("set-cookie", [
              ...(Array.isArray(existing) ? existing : [existing]),
              value,
            ]);
          } else {
            res.setHeader(key, value);
          }
        } else {
          res.setHeader(key, value);
        }
      });

      // Write response body
      const body = await response.text();
      res.end(body);
    } catch {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  };
}

module.exports = { toNodeHandler, fromNodeHeaders };
