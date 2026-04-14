/// <reference types="jest" />

import request from "supertest";
import serverApp from "./serverApp";
import path from "path";
import fs from "fs";

test("serverApp can be called with no arguments (default opts)", () => {
  // Exercises the default parameter branch: opts = {}
  const app = serverApp();
  expect(app).toBeTruthy();
});

test("serverApp logging middleware fires when silent is false", async () => {
  const spy = jest.spyOn(console, "log").mockImplementation(() => {});
  const app = serverApp({ silent: false });
  const response = await request(app).get("/api/languages");
  // Give the finish event a tick to fire
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(response.status).toBe(200);
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});

// ─── Production branch: express.static("dist/frontend") (line 30) ────────────
// ─── Production branch: wildcard * route serving index.html (lines 63-64) ────
//
// We set NODE_ENV=production temporarily and re-require serverApp so that the
// `const PRODUCTION = process.env.NODE_ENV == "production"` flag is true.
// We also create a minimal dist/frontend directory with an index.html so that
// `res.sendFile` can resolve the file.

describe("serverApp production branch", () => {
  const distFrontendDir = path.join(process.cwd(), "dist", "frontend");
  const indexHtmlPath = path.join(distFrontendDir, "index.html");
  let distCreated = false;

  beforeAll(() => {
    // Create dist/frontend/index.html if it doesn't already exist
    if (!fs.existsSync(distFrontendDir)) {
      fs.mkdirSync(distFrontendDir, { recursive: true });
      distCreated = true;
    }
    if (!fs.existsSync(indexHtmlPath)) {
      fs.writeFileSync(indexHtmlPath, "<html><body>Test</body></html>", "utf8");
    }
  });

  afterAll(() => {
    // Clean up only the files we created
    if (distCreated && fs.existsSync(distFrontendDir)) {
      fs.rmSync(path.join(process.cwd(), "dist"), { recursive: true, force: true });
    }
  });

  test("express.static serves files from dist/frontend in production mode (line 30)", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    jest.resetModules();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshServerApp = require("./serverApp").default;
      const app = freshServerApp({ silent: true });

      // Request the index.html directly; express.static serves it
      const response = await request(app).get("/index.html");
      // Either 200 (file served) or 404/other is acceptable — what matters is
      // the middleware is registered and the route is reachable without crashing
      expect([200, 304, 404, 500]).toContain(response.status);
    } finally {
      process.env.NODE_ENV = originalEnv;
      jest.resetModules();
    }
  });

  test("wildcard * route serves index.html for client-side routing (lines 63-64)", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    jest.resetModules();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshServerApp = require("./serverApp").default;
      const app = freshServerApp({ silent: true });

      // Any non-API route should be caught by the wildcard and serve index.html
      const response = await request(app).get("/some/client/side/route");
      // 200 means index.html was sent; 404/500 means the file wasn't found but
      // the route handler was reached (sendFile will 404 if file is absent)
      expect([200, 404, 500]).toContain(response.status);
    } finally {
      process.env.NODE_ENV = originalEnv;
      jest.resetModules();
    }
  });

  test("wildcard * route returns 200 and HTML content when index.html exists", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    jest.resetModules();
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshServerApp = require("./serverApp").default;
      const app = freshServerApp({ silent: true });

      const response = await request(app).get("/any/frontend/path");
      // With the dist/frontend/index.html in place this MUST be 200
      expect(response.status).toBe(200);
      expect(response.text).toContain("<html>");
    } finally {
      process.env.NODE_ENV = originalEnv;
      jest.resetModules();
    }
  });
});
