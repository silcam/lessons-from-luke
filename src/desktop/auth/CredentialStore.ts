import { safeStorage, app } from "electron";
import fs from "fs";
import path from "path";

const CREDENTIAL_FILENAME = "credential.bin";

/**
 * Stores the desktop bearer token on disk using Electron safeStorage (OS
 * keychain / DPAPI). Mirrors the atomic-write pattern used by LocalStorage.
 *
 * If safeStorage encryption is unavailable (locked keychain, pre-app.ready,
 * Linux without a keyring), the token is kept in memory for the current
 * session only and never written to disk. A lost laptop must never yield a
 * readable plaintext token.
 *
 * A decrypt failure on load (OS user changed, keychain reset, file copied to
 * another machine) is treated identically to "no credential present": the
 * device is considered unpaired and the unreadable blob is left in place so
 * the caller can decide to delete it.  MUST NOT crash the main process.
 *
 * No better-auth imports — holds an opaque string obtained over HTTP only.
 */
export class CredentialStore {
  private readonly basePath: string;
  private inMemoryToken: string | null = null;

  constructor(basePath?: string) {
    this.basePath = basePath ?? app.getPath("userData");
  }

  /**
   * Encrypt and persist the bearer token to disk. If safeStorage is
   * unavailable, keep the token in memory only and emit a user-visible
   * warning so the user knows the credential will not survive a restart.
   */
  async save(token: string): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn(
        "[CredentialStore] Secure storage is unavailable on this system. " +
          "The credential will be kept in memory for this session only and will not be " +
          "persisted to disk. Unlock your system keychain and restart the application to " +
          "enable persistent secure storage."
      );
      this.inMemoryToken = token;
      return;
    }

    // Encryption is available — persist to disk and clear any stale in-memory copy.
    this.inMemoryToken = null;
    const encrypted = safeStorage.encryptString(token);
    const credentialPath = path.join(this.basePath, CREDENTIAL_FILENAME);
    const tmpPath = credentialPath + "_tmp";
    fs.writeFileSync(tmpPath, encrypted);
    fs.renameSync(tmpPath, credentialPath);
  }

  /**
   * Load the bearer token. Returns the in-memory token if one is set (e.g.
   * when encryption was unavailable at save time), then falls back to reading
   * and decrypting the credential file. Returns null when unpaired, or if
   * decryption fails — the caller should treat null identically to
   * "no credential present".
   */
  async load(): Promise<string | null> {
    if (this.inMemoryToken !== null) {
      return this.inMemoryToken;
    }

    const credentialPath = path.join(this.basePath, CREDENTIAL_FILENAME);
    if (!fs.existsSync(credentialPath)) {
      return null;
    }

    try {
      const encrypted = fs.readFileSync(credentialPath);
      return safeStorage.decryptString(encrypted);
    } catch {
      // Decrypt failure: treat as unpaired. This can happen when the OS user
      // changes, the keychain is reset, or the file is copied to another machine.
      // Must not crash — return null so the caller falls through to "reconnect".
      return null;
    }
  }

  /**
   * Remove the persisted credential and clear any in-memory copy. The device
   * will appear unpaired after this call.
   */
  async clear(): Promise<void> {
    this.inMemoryToken = null;
    const credentialPath = path.join(this.basePath, CREDENTIAL_FILENAME);
    if (fs.existsSync(credentialPath)) {
      fs.unlinkSync(credentialPath);
    }
  }
}
