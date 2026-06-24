import * as crypto from "crypto";

// Fixed feature-scoped salt for key derivation (not a secret — just domain separation)
const FEATURE_SALT = "lessons-from-luke:invitation-tokens:v1";

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, FEATURE_SALT, 32);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function encryptToken(token: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return (
    iv.toString("base64") + ":" + authTag.toString("base64") + ":" + ciphertext.toString("base64")
  );
}

export function decryptToken(encryptedStr: string, secret: string): string | null {
  try {
    const parts = encryptedStr.split(":");
    if (parts.length !== 3) return null;
    const [ivB64, authTagB64, ciphertextB64] = parts;
    const key = deriveKey(secret);
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const ciphertext = Buffer.from(ciphertextB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

export function buildInvitationLink(token: string, baseUrl: string): string {
  return `${baseUrl}/invitation/${token}`;
}
