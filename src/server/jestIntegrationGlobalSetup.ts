/**
 * Jest globalSetup for integration tests.
 *
 * 1. Runs the standard test-DB migration and fixture loading (same as jestGlobalSetup.ts)
 * 2. Compiles the TypeScript server (tsc -b ./src/server) to ensure dist/ is current
 * 3. Starts the compiled Express server as a child process (avoiding Jest's CJS/ESM
 *    conflict with better-auth's ESM-only dist) on a random port
 * 4. Writes the server URL to process.env.INTEGRATION_SERVER_URL so tests can connect
 *
 * The server runs with NODE_ENV=test so it uses the test database and PGTestStorage.
 */
import { execSync, spawn } from "child_process";
import postgres from "postgres";
import secrets from "./util/secrets";
import pgLoadFixtures from "./storage/pgLoadFixtures";
import path from "path";

// Populated in setup, used in teardown
let serverProcess: ReturnType<typeof spawn> | null = null;

export default async function globalSetup() {
  // Step 1: Migrate and load fixtures (same as the base globalSetup)
  execSync("yarn migrate:test", { stdio: "inherit" });

  const sql = postgres({ ...secrets.testDb });
  await pgLoadFixtures(sql);
  await sql.end();
  console.log("✓ Test database reset to fixtures");

  // Step 2: Compile the server TypeScript so dist/ is current
  console.log("Building server TypeScript for integration tests...");
  execSync("node_modules/.bin/tsc -b ./src/server", {
    stdio: "inherit",
    cwd: path.join(__dirname, "..", ".."),
  });
  console.log("✓ Server TypeScript compiled");

  // Step 3: Start the compiled server as a child process
  const serverScriptPath = path.join(__dirname, "..", "..", "scripts", "integrationTestServer.js");

  await new Promise<void>((resolve, reject) => {
    serverProcess = spawn("node", [serverScriptPath], {
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      reject(new Error("Integration test server failed to start within 10 seconds"));
    }, 10_000);

    serverProcess.stdout!.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      try {
        const { port } = JSON.parse(line);
        clearTimeout(timeout);
        // Make the URL available to tests via environment variable
        process.env.INTEGRATION_SERVER_URL = `http://127.0.0.1:${port}`;
        // Also store the PID for teardown
        process.env.INTEGRATION_SERVER_PID = String(serverProcess!.pid);
        console.log(`✓ Integration test server started on port ${port}`);
        resolve();
      } catch {
        // Not the port JSON line — ignore
      }
    });

    serverProcess.stderr!.on("data", (data: Buffer) => {
      // Log server errors to help debug failures
      process.stderr.write(`[integration-server] ${data}`);
    });

    serverProcess.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Integration server exited with code ${code}`));
      }
    });
  });
}

// Export so globalTeardown can kill the server
export { serverProcess };
