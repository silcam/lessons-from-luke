/// <reference types="jest" />

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// Capture ipcMain.handle registrations so tests can invoke handlers directly.
type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const ipcHandlers: Record<string, IpcHandler> = {};

// Capture the app "ready" callback so tests control when appReady() fires.
let appReadyCallback: (() => void) | undefined;

const mockWebContents = { send: jest.fn() };
const mockMainWindow = {
  webContents: mockWebContents,
  loadFile: jest.fn(),
  loadURL: jest.fn(),
  on: jest.fn(),
};

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/test-data"),
    isPackaged: false,
    on: jest.fn((event: string, handler: () => void) => {
      if (event === "ready") appReadyCallback = handler;
    }),
    quit: jest.fn(),
    getVersion: jest.fn(() => "1.0.0"),
  },
  ipcMain: {
    handle: jest.fn((channel: string, handler: IpcHandler) => {
      ipcHandlers[channel] = handler;
    }),
    on: jest.fn(),
    removeHandler: jest.fn(),
  },
  BrowserWindow: jest.fn(() => mockMainWindow),
  protocol: { handle: jest.fn() },
  Menu: {
    buildFromTemplate: jest.fn((t: unknown) => t),
    setApplicationMenu: jest.fn(),
  },
  shell: {},
  dialog: { showMessageBox: jest.fn() },
}));

jest.mock("electron-context-menu", () => jest.fn());
jest.mock("electron-window-state", () =>
  jest.fn(() => ({ x: 0, y: 0, width: 1000, height: 800, manage: jest.fn() }))
);
jest.mock("electron-default-menu", () => jest.fn(() => [{}, {}, { submenu: [] }, {}, {}]));
jest.mock("./DesktopAPIServer", () => ({ __esModule: true, default: { listen: jest.fn() } }));
jest.mock("./controllers/downSync", () => ({
  downSync: jest.fn(),
  fetchMissingPreviews: jest.fn(),
}));

// Stable mock web client — shared reference so tests can configure return values.
const mockWebClient = {
  get: jest.fn(),
  post: jest.fn(),
  setPaired: jest.fn(),
  isConnected: jest.fn(() => false),
  isPaired: jest.fn(() => false),
  onPairedChange: jest.fn(),
  onConnectionChange: jest.fn(),
  watch: jest.fn(),
  probeConnection: jest.fn().mockResolvedValue(undefined),
};

jest.mock("./WebAPIClientForDesktop", () => ({
  __esModule: true,
  default: jest.fn(() => mockWebClient),
}));

// Mock axios for the best-effort sign-out call in pairingDisconnect.
const mockAxiosPost = jest.fn().mockResolvedValue({ data: {} });
jest.mock("axios", () => ({
  __esModule: true,
  default: { post: mockAxiosPost, get: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import DesktopApp from "./DesktopApp";
import { downSync } from "./controllers/downSync";
import type { CredentialStore } from "./auth/CredentialStore";
import type { DevicePairing, PairingResult, PairingHandle } from "./auth/DevicePairing";
import type LocalStorage from "./LocalStorage";
import {
  DEVICE_STATE,
  PAIRING_CANCEL,
  PAIRING_DISCONNECT,
  PAIRING_START,
} from "../core/api/IpcChannels";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockCredentialStore(token: string | null = null): jest.Mocked<CredentialStore> {
  return {
    load: jest.fn().mockResolvedValue(token),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CredentialStore>;
}

function makeMockDevicePairing(
  result: PairingResult = { status: "declined" },
  userCode = "ABCD-1234"
): jest.Mocked<DevicePairing> {
  const handle: PairingHandle = {
    userCode,
    completion: Promise.resolve(result),
  };
  return {
    startPairing: jest.fn().mockResolvedValue(handle),
  } as unknown as jest.Mocked<DevicePairing>;
}

const mockLocalStorage: Partial<LocalStorage> = {
  getSyncState: jest.fn(() => ({ locale: "en" }) as any),
  setSyncState: jest.fn(),
  readDataUsed: jest.fn(() => []),
  writeLogEntry: jest.fn(),
  logDataUsed: jest.fn(),
};

/** Creates a DesktopApp, fires the Electron "ready" event, and waits for
 * the async pairing initialisation to complete. */
async function createApp(
  credentialStore: CredentialStore,
  devicePairing: DevicePairing
): Promise<DesktopApp> {
  const desktopApp = new DesktopApp(
    mockLocalStorage as LocalStorage,
    credentialStore,
    devicePairing
  );
  expect(appReadyCallback).toBeDefined();
  appReadyCallback!();
  // Wait for async initPairing (stored as pairingInit by appReady).
  await (desktopApp as any).pairingInit;
  return desktopApp;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DesktopApp pairing lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(ipcHandlers).forEach((k) => delete ipcHandlers[k]);
    appReadyCallback = undefined;

    // Restore sensible defaults after clearAllMocks wipes implementations.
    mockWebClient.get.mockResolvedValue(null);
    mockWebClient.isConnected.mockReturnValue(false);
    mockWebClient.isPaired.mockReturnValue(false);
    mockAxiosPost.mockResolvedValue({ data: {} });
  });

  // -------------------------------------------------------------------------
  // Startup: initPairing
  // -------------------------------------------------------------------------

  describe("startup: initPairing", () => {
    test("when no credential is stored, paired stays false and webClient is not told to pair", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).paired).toBe(false);
      expect(mockWebClient.setPaired).not.toHaveBeenCalled();
    });

    test("when a credential is stored, paired becomes true and webClient is told to pair", async () => {
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).paired).toBe(true);
      expect(mockWebClient.setPaired).toHaveBeenCalledWith(true);
    });

    test("when a credential is stored, fetches /api/auth/get-session for pairedUserName", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
        user: { id: "u1", admin: false, email: "alice@example.com", name: "Alice" },
      });
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(mockWebClient.get).toHaveBeenCalledWith("/api/auth/get-session", {});
    });

    test("pairedUserName is set to user.name from session", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
        user: { id: "u1", admin: false, email: "alice@example.com", name: "Alice" },
      });
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).pairedUserName).toBe("Alice");
    });

    test("pairedUserName falls back to user.email when name is absent", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
        user: { id: "u1", admin: false, email: "bob@example.com" },
      });
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).pairedUserName).toBe("bob@example.com");
    });

    test("paired stays true but pairedUserName stays undefined when session fetch fails", async () => {
      mockWebClient.get.mockRejectedValueOnce(new Error("network error"));
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).paired).toBe(true);
      expect((app as any).pairedUserName).toBeUndefined();
    });

    test("paired stays true but pairedUserName stays undefined when session returns null", async () => {
      mockWebClient.get.mockResolvedValueOnce(null);
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).paired).toBe(true);
      expect((app as any).pairedUserName).toBeUndefined();
    });

    test("no credential → does NOT call /api/auth/get-session", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(mockWebClient.get).not.toHaveBeenCalled();
    });

    test("listens for webClient onPairedChange and syncs paired/pairedUserName", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        user: { id: "u1", admin: false, name: "Alice" },
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
      });
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      // Simulate webClient signaling 401 → paired=false
      expect(mockWebClient.onPairedChange).toHaveBeenCalled();
      const [onPairedChangeCallback] = mockWebClient.onPairedChange.mock.calls[0];
      onPairedChangeCallback(false);

      expect((app as any).paired).toBe(false);
      expect((app as any).pairedUserName).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // DEVICE_STATE IPC handler
  // -------------------------------------------------------------------------

  describe("device:state handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers[DEVICE_STATE]).toBeDefined();
    });

    test("returns { paired: false, pairedUserName: undefined } when unpaired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      const result = await ipcHandlers[DEVICE_STATE]({});
      expect(result).toEqual({ paired: false, pairedUserName: undefined });
    });

    test("returns { paired: true, pairedUserName } when paired with name", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        user: { id: "u1", admin: false, name: "Alice", email: "alice@example.com" },
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
      });
      const cs = makeMockCredentialStore("stored-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      const result = await ipcHandlers[DEVICE_STATE]({});
      expect(result).toEqual({ paired: true, pairedUserName: "Alice" });
    });
  });

  // -------------------------------------------------------------------------
  // pairingStart IPC handler (renamed from device:connect; now split-flow)
  // -------------------------------------------------------------------------

  describe("pairingStart handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers[PAIRING_START]).toBeDefined();
    });

    test("calls devicePairing.startPairing()", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" });
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      expect(dp.startPairing).toHaveBeenCalledTimes(1);
    });

    test("returns { userCode } from the PairingHandle immediately", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" }, "XYZW-1234");
      await createApp(cs, dp);

      const result = await ipcHandlers[PAIRING_START]({});
      expect(result).toEqual({ userCode: "XYZW-1234" });
    });

    test("on approval: saves token via credentialStore.save", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "approved", token: "new-token" });
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      // Give background completion microtask a chance to run.
      await new Promise((r) => setTimeout(r, 0));
      expect(cs.save).toHaveBeenCalledWith("new-token");
    });

    test("on approval: sets paired=true and notifies webClient", async () => {
      jest.clearAllMocks();
      mockWebClient.get.mockResolvedValue(null);
      mockWebClient.isConnected.mockReturnValue(false);
      appReadyCallback = undefined;
      Object.keys(ipcHandlers).forEach((k) => delete ipcHandlers[k]);

      const cs2 = makeMockCredentialStore(null);
      const dp2 = makeMockDevicePairing({ status: "approved", token: "new-token" });
      const freshApp = await createApp(cs2, dp2);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));
      expect((freshApp as any).paired).toBe(true);
      expect(mockWebClient.setPaired).toHaveBeenCalledWith(true);
    });

    test("on approval: fetches session for pairedUserName", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        user: { id: "u1", admin: false, email: "newuser@example.com" },
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
      });
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "approved", token: "new-token" });
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));
      expect(mockWebClient.get).toHaveBeenCalledWith("/api/auth/get-session", {});

      const state = (await ipcHandlers[DEVICE_STATE]({})) as any;
      expect(state.pairedUserName).toBe("newuser@example.com");
    });

    test("on approval: sends ON_SYNC_STATE_CHANGE with paired=true to renderer", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        user: { id: "u1", admin: false, name: "Alice", email: "alice@example.com" },
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
      });
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "approved", token: "tok" });
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));

      // ON_SYNC_STATE_CHANGE is "onSyncStateChange"
      const sentCalls = mockWebContents.send.mock.calls;
      const syncCall = sentCalls.find((c) => c[0] === "onSyncStateChange");
      expect(syncCall).toBeDefined();
      expect(syncCall![1]).toMatchObject({ paired: true });
    });

    test("on declined: does NOT save token, stays unpaired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" });
      const freshApp = await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));
      expect(cs.save).not.toHaveBeenCalled();
      expect((freshApp as any).paired).toBe(false);
    });

    test("on declined: sends onPairingError event with reason 'declined'", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" });
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));

      const sentCalls = mockWebContents.send.mock.calls;
      const errorCall = sentCalls.find((c) => c[0] === "onPairingError");
      expect(errorCall).toBeDefined();
      expect(errorCall![1]).toEqual({ reason: "declined" });
    });

    test("on expired: does NOT save token, stays unpaired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "expired" });
      const freshApp = await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));
      expect(cs.save).not.toHaveBeenCalled();
      expect((freshApp as any).paired).toBe(false);
    });

    test("on expired: sends onPairingError event with reason 'expired'", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "expired" });
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_START]({});
      await new Promise((r) => setTimeout(r, 0));

      const sentCalls = mockWebContents.send.mock.calls;
      const errorCall = sentCalls.find((c) => c[0] === "onPairingError");
      expect(errorCall).toBeDefined();
      expect(errorCall![1]).toEqual({ reason: "expired" });
    });
  });

  // -------------------------------------------------------------------------
  // pairingCancel IPC handler (new)
  // -------------------------------------------------------------------------

  describe("pairingCancel handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers[PAIRING_CANCEL]).toBeDefined();
    });

    test("invoking pairingCancel does not throw", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await expect(ipcHandlers[PAIRING_CANCEL]({})).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // pairingDisconnect IPC handler (renamed from device:disconnect)
  // -------------------------------------------------------------------------

  describe("pairingDisconnect handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers[PAIRING_DISCONNECT]).toBeDefined();
    });

    test("clears credential via credentialStore.clear", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect(cs.clear).toHaveBeenCalledTimes(1);
    });

    test("sets paired=false on DesktopApp", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      const freshApp = await createApp(cs, dp);

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect((freshApp as any).paired).toBe(false);
    });

    test("notifies webClient that paired is false", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      // Clear any setPaired calls from init.
      mockWebClient.setPaired.mockClear();

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect(mockWebClient.setPaired).toHaveBeenCalledWith(false);
    });

    test("clears pairedUserName", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        user: { id: "u1", admin: false, name: "Alice" },
        session: { id: "s1", userId: "u1", expiresAt: "2027-01-01" },
      });
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      const freshApp = await createApp(cs, dp);

      expect((freshApp as any).pairedUserName).toBe("Alice");

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect((freshApp as any).pairedUserName).toBeUndefined();
    });

    test("device:state returns unpaired state after disconnect", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_DISCONNECT]({});
      const result = await ipcHandlers[DEVICE_STATE]({});
      expect(result).toEqual({ paired: false, pairedUserName: undefined });
    });

    test("attempts sign-out via POST /api/auth/sign-out with bearer token when online", async () => {
      mockWebClient.isConnected.mockReturnValue(true);
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect(mockAxiosPost).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/sign-out"),
        {},
        expect.objectContaining({
          headers: { Authorization: "Bearer existing-token" },
        })
      );
    });

    test("skips sign-out POST when offline, still clears credential", async () => {
      mockWebClient.isConnected.mockReturnValue(false);
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(cs.clear).toHaveBeenCalledTimes(1);
    });

    test("still clears credential when sign-out POST fails", async () => {
      mockWebClient.isConnected.mockReturnValue(true);
      mockAxiosPost.mockRejectedValueOnce(new Error("network error"));
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers[PAIRING_DISCONNECT]({});
      expect(cs.clear).toHaveBeenCalledTimes(1);
    });

    test("emits structured audit log on disconnect with userId and timestamp but not token", async () => {
      mockWebClient.get.mockResolvedValueOnce({
        user: { id: "user-123", admin: false, name: "Alice", email: "alice@example.com" },
        session: { id: "s1", userId: "user-123", expiresAt: "2027-01-01" },
      });
      const cs = makeMockCredentialStore("secret-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
      try {
        await ipcHandlers[PAIRING_DISCONNECT]({});

        const logCalls = consoleSpy.mock.calls
          .map((args) => args[0])
          .filter((s) => {
            try {
              return JSON.parse(s)?.event === "device:disconnect";
            } catch {
              return false;
            }
          });
        expect(logCalls).toHaveLength(1);
        const parsed = JSON.parse(logCalls[0]);
        expect(parsed.userId).toBe("user-123");
        expect(parsed.timestamp).toBeDefined();
        expect(logCalls[0]).not.toContain("secret-token");
      } finally {
        consoleSpy.mockRestore();
      }
    });

    test("logs warning when sign-out POST fails about server-side invalidation via expiry", async () => {
      mockWebClient.isConnected.mockReturnValue(true);
      mockAxiosPost.mockRejectedValueOnce(new Error("network error"));
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await ipcHandlers[PAIRING_DISCONNECT]({});
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("expiry"));
      } finally {
        warnSpy.mockRestore();
      }
    });

    test("sends ON_SYNC_STATE_CHANGE with paired=false to renderer after disconnect", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      mockWebContents.send.mockClear();

      await ipcHandlers[PAIRING_DISCONNECT]({});

      const sentCalls = mockWebContents.send.mock.calls;
      const syncCall = sentCalls.find((c) => c[0] === "onSyncStateChange");
      expect(syncCall).toBeDefined();
      expect(syncCall![1]).toEqual({ paired: false, pairedUserName: undefined });
    });
  });

  // -------------------------------------------------------------------------
  // FR-020: Existing language-code selection is unaffected
  // -------------------------------------------------------------------------

  describe("FR-020: language-code selection continuity", () => {
    test("DesktopAPIServer.listen is called during appReady (existing IPC routes still registered)", async () => {
      const DesktopAPIServer = require("./DesktopAPIServer").default;
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(DesktopAPIServer.listen).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // dev baseUrl: must route through webpack proxy (:8080) so that
  // verification_uri_complete built by better-auth resolves to :8080/link
  // (served by webpack historyApiFallback), not :8081/link (404 in dev).
  // See: bug wgr.28, trustedOrigins.ts DEFAULT_BASE_URL comment.
  // -------------------------------------------------------------------------

  describe("dev baseUrl (bug wgr.28)", () => {
    test("uses webpack proxy (:8080) as dev baseUrl when app is not packaged", async () => {
      // app.isPackaged === false (set in the electron mock above).
      // The webpack dev server on :8080 proxies /api and /webified to :8081,
      // so all API calls still reach the API server. Using :8080 as baseUrl
      // causes better-auth (via BETTER_AUTH_URL=http://localhost:8080 in
      // serve-dev) to build verification_uri_complete pointing to :8080/link,
      // which webpack serves via historyApiFallback (not 404 as :8081/link).
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      const app = await createApp(cs, dp);

      expect((app as any).baseUrl).toBe("http://localhost:8080");
    });
  });

  // -------------------------------------------------------------------------
  // Sync watch tick gating (FR-015 / FR-016)
  //
  // The continuous sync loop must only pull project data while paired. After an
  // Admin > Disconnect Account (un-pair), the loop must STOP hitting the sync
  // API and fall back to a lightweight connectivity probe — which both stops the
  // unwanted sync traffic and keeps the renderer's online/offline gate accurate
  // so the "Connect to account" prompt shows.
  // -------------------------------------------------------------------------

  describe("sync watch tick gating", () => {
    test("pulls a downSync when paired, but only probes connectivity when un-paired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      // startDownSync registers the watch callback; capture it to invoke directly.
      expect(mockWebClient.watch).toHaveBeenCalledTimes(1);
      const tick = mockWebClient.watch.mock.calls[0][0] as (
        client: typeof mockWebClient
      ) => Promise<void>;

      // Paired: pull a full downSync, never probe.
      mockWebClient.isPaired.mockReturnValue(true);
      await tick(mockWebClient);
      expect(downSync).toHaveBeenCalledTimes(1);
      expect(mockWebClient.probeConnection).not.toHaveBeenCalled();

      // Un-paired: never sync, only probe connectivity.
      (downSync as jest.Mock).mockClear();
      mockWebClient.isPaired.mockReturnValue(false);
      await tick(mockWebClient);
      expect(downSync).not.toHaveBeenCalled();
      expect(mockWebClient.probeConnection).toHaveBeenCalledTimes(1);
    });
  });
});
