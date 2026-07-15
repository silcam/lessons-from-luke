/**
 * secrets.integration.test.ts
 *
 * Integration-level startup tests for FR-002's production fail-fast guard (US3
 * Acceptance Scenarios 1-2; specs/acceptance-specs/US11-environment-aware-email.txt
 * scenarios 1-2). Unlike secrets.test.ts (which `require()`s the TS source IN this
 * Jest process), these spawn the COMPILED module (`dist/server/util/secrets.js`) as a
 * real, separate Node child process with a temp `secrets.json` on its own `cwd` and
 * NODE_ENV=production — proving the actual *process* exits non-zero / starts cleanly,
 * not just that an in-process `require()` throws.
 *
 * Scenario 4 ("starting with valid complete email config -> process starts and
 * /health (or equivalent) returns 200") has no literal `/health` route in this
 * codebase — so per the scenario's "(or equivalent)" allowance, "ready to serve" is
 * proven by spawning the compiled secrets + getEmailTransport modules and confirming
 * the process exits 0 with no stderr AND getEmailTransport() resolves to
 * MailgunEmailTransport. This avoids booting the full Express app / a live Postgres
 * connection (secrets.ts and getEmailTransport.ts touch neither at module load).
 *
 * Spec: specs/005-transactional-email-reset/spec.md §US3 Acceptance Scenarios 1-2
 * data-model.md §EmailConfig; plan.md §Security (Pass 2 fail-closed, Pass 7 cross-field DKIM)
 * Acceptance: specs/acceptance-specs/US11-environment-aware-email.txt scenarios 1-2
 *
 * Runs via `yarn test:integration` (jest.integration.config.js); excluded from the
 * default `yarn test` ("server" project ignores `*.integration.test.ts`).
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const repoRoot = path.join(__dirname, "..", "..", "..");
const distSecretsPath = path.join(repoRoot, "dist", "server", "util", "secrets.js");
const distGetEmailTransportPath = path.join(
  repoRoot,
  "dist",
  "server",
  "email",
  "getEmailTransport.js"
);

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** A complete, valid (non-email) secrets base — every other production-gated field set. */
const validBaseSecrets = {
  cookieSecret: "an-integration-test-cookie-secret-well-over-32-chars!!",
  adminEmail: "admin@example.com",
  adminUsername: "admin",
  adminPassword: "IntegrationAdminPW1",
  db: { database: "unused-db", username: "unused", password: "unused" },
  testDb: { database: "unused-test-db", username: "unused", password: "unused" },
  devDb: { database: "unused-dev-db", username: "unused", password: "unused" },
};

/** A fully valid, non-placeholder email config (passes per-field + cross-field DKIM checks). */
const validEmailConfig = {
  apiKey: "integration-test-mailgun-api-key-not-a-real-credential",
  domain: "mg.integration-test.example",
  fromAddress: "noreply@mg.integration-test.example",
};

/**
 * Spawns a fresh node process that requires ONLY the compiled secrets module (and
 * optionally one more `require(...)` line) — no Express, no DB — with the given
 * secrets.json contents on its own temp cwd. Mirrors how `server.ts` requiring
 * `secrets.ts` transitively is the FIRST thing that happens when the real process
 * boots: the synchronous fail-fast throw happens before any DB/HTTP setup runs.
 */
function runSecretsStartup(secretsContents: unknown, extraRequireCode?: string): RunResult {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "secrets-startup-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "secrets.json"), JSON.stringify(secretsContents), "utf8");

    const lines = [`require(${JSON.stringify(distSecretsPath)});`];
    if (extraRequireCode !== undefined) {
      lines.push(extraRequireCode);
    }
    lines.push(`process.stdout.write("STARTUP_OK\\n");`);

    const result = spawnSync(process.execPath, ["-e", lines.join("\n")], {
      cwd: tmpDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://reset.example.com",
      },
      encoding: "utf8",
      timeout: 10_000,
    });

    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("production server process startup — FR-002 fail-fast (US3 Acceptance Scenario 1)", () => {
  test("secrets.email absent: process exits non-zero, stderr names the field, no secret values printed", () => {
    const result = runSecretsStartup(validBaseSecrets);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/email/i);
    expect(result.stderr).not.toContain(validBaseSecrets.cookieSecret);
    expect(result.stderr).not.toContain(validBaseSecrets.adminPassword);
  });

  test("email.apiKey empty: process exits non-zero, stderr names email.apiKey", () => {
    const result = runSecretsStartup({
      ...validBaseSecrets,
      email: { ...validEmailConfig, apiKey: "" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/email\.apiKey/i);
  });

  test("email.apiKey is the built-in placeholder: process exits non-zero, stderr names email.apiKey", () => {
    const result = runSecretsStartup({
      ...validBaseSecrets,
      email: { ...validEmailConfig, apiKey: "your-mailgun-api-key-here" },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/email\.apiKey/i);
  });

  test(
    "fromAddress domain not aligned with domain (DKIM/DMARC cross-field): process exits " +
      "non-zero, stderr names both email.fromAddress and email.domain, never the values",
    () => {
      const mismatched = {
        apiKey: validEmailConfig.apiKey,
        domain: "mg.real-domain.example",
        fromAddress: "noreply@other-domain.example",
      };
      const result = runSecretsStartup({ ...validBaseSecrets, email: mismatched });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/email\.fromAddress/i);
      expect(result.stderr).toMatch(/email\.domain/i);
      expect(result.stderr).not.toContain(mismatched.domain);
      expect(result.stderr).not.toContain("other-domain.example");
    }
  );
});

describe("production server process startup — valid config (US3 Acceptance Scenario 2)", () => {
  test(
    "complete, valid email config: process starts cleanly (exit 0, no stderr) and " +
      "getEmailTransport() resolves to MailgunEmailTransport — the 'ready to serve' " +
      "signal standing in for /health (no such route exists in this codebase)",
    () => {
      const extra = [
        `const { getEmailTransport } = require(${JSON.stringify(distGetEmailTransportPath)});`,
        `process.stdout.write(getEmailTransport().constructor.name + "\\n");`,
      ].join("\n");

      const result = runSecretsStartup({ ...validBaseSecrets, email: validEmailConfig }, extra);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("MailgunEmailTransport");
    }
  );
});
