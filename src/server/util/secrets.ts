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
  email?: {
    apiKey: string;
    domain: string;
    fromAddress: string;
    baseUrl?: string;
  };
}

const defaultSecrets: Secrets = {
  cookieSecret: "dev-only-secret-replace-in-production-xx",
  adminEmail: "admin@example.com",
  adminUsername: "chris",
  adminPassword: "dev-password-1",
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
  email: {
    apiKey: "your-mailgun-api-key-here",
    domain: "mg.example.com",
    fromAddress: "noreply@mg.example.com",
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

if (process.env.NODE_ENV === "production" && secrets.cookieSecret === defaultSecrets.cookieSecret) {
  throw new Error(
    "Invalid configuration: cookieSecret must not be the built-in default in production. " +
      "Set a strong, unique cookieSecret in your secrets.json."
  );
}

// FR-011: adminPassword must meet the same 12-char NIST/OWASP minimum enforced by better-auth.
// Fail fast here so a misconfigured secrets.json is caught at startup, not at sign-in.
if (secrets.adminPassword.length < 12) {
  throw new Error(
    "Invalid configuration: adminPassword must be at least 12 characters long. " +
      "Update your secrets.json to set a stronger adminPassword."
  );
}

if (
  process.env.NODE_ENV === "production" &&
  secrets.adminPassword === defaultSecrets.adminPassword
) {
  throw new Error(
    "Invalid configuration: adminPassword must not be the built-in default in production. " +
      "Set a strong, unique adminPassword in your secrets.json."
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

// FR-002: Fail fast at startup if email configuration is missing or uses placeholder defaults in production.
// Never log the value of secrets fields — only log which field is invalid.
if (process.env.NODE_ENV === "production") {
  if (!secrets.email) {
    throw new Error(
      "Invalid configuration: email is required in production. " +
        "Set email.apiKey, email.domain, and email.fromAddress in your secrets.json."
    );
  }

  if (!secrets.email.apiKey || secrets.email.apiKey === defaultSecrets.email!.apiKey) {
    throw new Error(
      "Invalid configuration: email.apiKey must not be empty or the built-in placeholder in production. " +
        "Set a real API key in your secrets.json."
    );
  }

  if (!secrets.email.domain || secrets.email.domain === defaultSecrets.email!.domain) {
    throw new Error(
      "Invalid configuration: email.domain must not be empty or the built-in placeholder in production. " +
        "Set your sending domain in your secrets.json."
    );
  }

  if (!secrets.email.fromAddress || secrets.email.fromAddress === defaultSecrets.email!.fromAddress) {
    throw new Error(
      "Invalid configuration: email.fromAddress must not be empty or the built-in placeholder in production. " +
        "Set your from address in your secrets.json."
    );
  }

  // Cross-field: the domain part of email.fromAddress must equal or be a subdomain of email.domain.
  // This ensures DKIM/DMARC alignment between the sending domain and the from address.
  const atIndex = secrets.email.fromAddress.indexOf("@");
  const fromDomain = atIndex >= 0 ? secrets.email.fromAddress.slice(atIndex + 1) : "";
  if (fromDomain !== secrets.email.domain && !fromDomain.endsWith("." + secrets.email.domain)) {
    throw new Error(
      "Invalid configuration: the domain part of email.fromAddress does not align with email.domain. " +
        "For DKIM/DMARC alignment, email.fromAddress must use email.domain or a subdomain of email.domain."
    );
  }
}

export default secrets;
