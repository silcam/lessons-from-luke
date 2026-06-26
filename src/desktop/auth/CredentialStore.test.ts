/// <reference types="jest" />

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-electron-data"),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((text: string) => Buffer.from(`enc:${text}`)),
    decryptString: jest.fn((buf: Buffer) => buf.toString().replace("enc:", "")),
  },
}));

import os from "os";
import path from "path";
import fs from "fs";
import { safeStorage } from "electron";
import { CredentialStore } from "./CredentialStore";

let testDir: string;
let store: CredentialStore;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "cred-store-test-"));

  (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(true);
  (safeStorage.encryptString as jest.Mock).mockImplementation(
    (text: string) => Buffer.from(`enc:${text}`)
  );
  (safeStorage.decryptString as jest.Mock).mockImplementation(
    (buf: Buffer) => buf.toString().replace("enc:", "")
  );

  store = new CredentialStore(testDir);
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
  jest.clearAllMocks();
});

describe("CredentialStore", () => {
  test("save+load round-trip returns the saved token", async () => {
    await store.save("my-bearer-token");
    const token = await store.load();
    expect(token).toBe("my-bearer-token");
  });

  test("load returns null when no credential has been saved", async () => {
    const token = await store.load();
    expect(token).toBeNull();
  });

  test("save writes credential.bin using atomic tmp-file rename (no leftover _tmp file)", async () => {
    await store.save("my-bearer-token");
    const credentialPath = path.join(testDir, "credential.bin");
    const tmpPath = credentialPath + "_tmp";
    expect(fs.existsSync(credentialPath)).toBe(true);
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  test("clear removes credential file so subsequent load returns null", async () => {
    await store.save("my-bearer-token");
    await store.clear();

    const credentialPath = path.join(testDir, "credential.bin");
    expect(fs.existsSync(credentialPath)).toBe(false);

    const token = await store.load();
    expect(token).toBeNull();
  });

  test("clear does not throw when no credential file exists", async () => {
    await expect(store.clear()).resolves.toBeUndefined();
  });

  test("decrypt failure returns null (treats device as unpaired, does not crash)", async () => {
    await store.save("my-bearer-token");

    // Simulate decrypt failure (OS user changed, keychain reset, file copied to another machine)
    (safeStorage.decryptString as jest.Mock).mockImplementation(() => {
      throw new Error("Decryption failed");
    });

    const store2 = new CredentialStore(testDir);
    const token = await store2.load();
    expect(token).toBeNull();
  });

  test("encryption unavailable: saves token in memory only without writing to disk", async () => {
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);
    const inMemoryStore = new CredentialStore(testDir);

    await inMemoryStore.save("session-only-token");

    const credentialPath = path.join(testDir, "credential.bin");
    expect(fs.existsSync(credentialPath)).toBe(false);

    const token = await inMemoryStore.load();
    expect(token).toBe("session-only-token");
  });

  test("encryption unavailable: token is not persisted across instances (session-only)", async () => {
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);
    const inMemoryStore = new CredentialStore(testDir);
    await inMemoryStore.save("session-only-token");

    // A new store instance with the same basePath must NOT find the token
    const newStore = new CredentialStore(testDir);
    const token = await newStore.load();
    expect(token).toBeNull();
  });

  test("encryption unavailable: logs a user-visible warning", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(false);
    const inMemoryStore = new CredentialStore(testDir);

    await inMemoryStore.save("session-only-token");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("CredentialStore"));
    warnSpy.mockRestore();
  });
});
