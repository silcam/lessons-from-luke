import fs from "fs";

const secretsJson = "secrets.json";

export interface Secrets {
  cookieSecret: string;
  adminEmail?: string;
  adminUsername: string;
  adminPassword: string;
  db: {
    database: string;
    username: string;
    password: string;
  };
  testDb: {
    database: string;
    username: string;
    password: string;
  };
  devDb: {
    database: string;
    username: string;
    password: string;
  };
}

const defaultSecrets: Secrets = {
  cookieSecret: "dev-only-secret-replace-in-production-xx",
  adminEmail: "admin@example.com",
  adminUsername: "chris",
  adminPassword: "yo",
  db: {
    database: "lessons-from-luke",
    username: "lessons-from-luke",
    password: "lessons-from-luke",
  },
  testDb: {
    database: "lessons-from-luke-test",
    username: "lessons-from-luke",
    password: "lessons-from-luke",
  },
  devDb: {
    database: "lessons-from-luke-dev",
    username: "lessons-from-luke",
    password: "lessons-from-luke",
  },
};

const secrets: Secrets = fs.existsSync(secretsJson)
  ? JSON.parse(fs.readFileSync(secretsJson).toString())
  : defaultSecrets;

// FR-011: Fail fast at startup if required auth configuration is missing or too weak.
// Never log the value of secrets fields — only log which field is invalid.

if (secrets.cookieSecret.length < 32) {
  throw new Error(
    "Invalid configuration: cookieSecret must be at least 32 characters long. " +
      "Update your secrets.json or environment configuration."
  );
}

if (process.env.NODE_ENV === "production" && !secrets.adminEmail) {
  throw new Error(
    "Invalid configuration: adminEmail is required in production. " +
      "Set adminEmail in your secrets.json or environment configuration."
  );
}

if (process.env.NODE_ENV === "production") {
  const betterAuthUrl = process.env.BETTER_AUTH_URL;
  if (!betterAuthUrl || !betterAuthUrl.startsWith("https://")) {
    throw new Error(
      "Invalid configuration: BETTER_AUTH_URL must be set to an https:// URL in production. " +
        "Set the BETTER_AUTH_URL environment variable to your server's public https URL."
    );
  }
}

export default secrets;
