/**
 * Jest globalTeardown for integration tests.
 *
 * Kills the integration test server that was started in jestIntegrationGlobalSetup.ts.
 */
export default async function globalTeardown() {
  const pid = process.env.INTEGRATION_SERVER_PID;
  if (pid) {
    try {
      process.kill(parseInt(pid, 10), "SIGTERM");
      console.log(`✓ Integration test server (PID ${pid}) terminated`);
    } catch {
      // Server may have already exited — that's fine
    }
  }
}
