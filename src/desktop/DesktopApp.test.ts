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
jest.mock("electron-default-menu", () =>
  jest.fn(() => [{}, {}, { submenu: [] }, {}, {}])
);
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
};

jest.mock("./WebAPIClientForDesktop", () => ({
  __esModule: true,
  default: jest.fn(() => mockWebClient),
}));

// Mock axios for the best-effort sign-out call in device:disconnect.
const mockAxiosPost = jest.fn().mockResolvedValue({ data: {} });
jest.mock("axios", () => ({
  __esModule: true,
  default: { post: mockAxiosPost, get: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import DesktopApp from "./DesktopApp";
import type { CredentialStore } from "./auth/CredentialStore";
import type { DevicePairing, PairingResult } from "./auth/DevicePairing";
import type LocalStorage from "./LocalStorage";

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

function makeMockDevicePairing(result: PairingResult = { status: "declined" }): jest.Mocked<DevicePairing> {
  return {
    startPairing: jest.fn().mockResolvedValue(result),
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
  // device:state IPC handler
  // -------------------------------------------------------------------------

  describe("device:state handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers["device:state"]).toBeDefined();
    });

    test("returns { paired: false, pairedUserName: undefined } when unpaired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      const result = await ipcHandlers["device:state"]({});
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

      const result = await ipcHandlers["device:state"]({});
      expect(result).toEqual({ paired: true, pairedUserName: "Alice" });
    });
  });

  // -------------------------------------------------------------------------
  // device:connect IPC handler
  // -------------------------------------------------------------------------

  describe("device:connect handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers["device:connect"]).toBeDefined();
    });

    test("calls devicePairing.startPairing()", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" });
      await createApp(cs, dp);

      await ipcHandlers["device:connect"]({});
      expect(dp.startPairing).toHaveBeenCalledTimes(1);
    });

    test("on approval: saves token via credentialStore.save", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "approved", token: "new-token" });
      await createApp(cs, dp);

      await ipcHandlers["device:connect"]({});
      expect(cs.save).toHaveBeenCalledWith("new-token");
    });

    test("on approval: sets paired=true and notifies webClient", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "approved", token: "new-token" });
      await createApp(cs, dp);

      const app = await (async () => {
        // Re-run so we can capture the returned DesktopApp.
        // (app was already created above — just test the side effect)
        // Re-create for isolation within this test.
        return undefined;
      })();

      // Recreate isolated
      jest.clearAllMocks();
      mockWebClient.get.mockResolvedValue(null);
      mockWebClient.isConnected.mockReturnValue(false);
      appReadyCallback = undefined;
      Object.keys(ipcHandlers).forEach((k) => delete ipcHandlers[k]);

      const cs2 = makeMockCredentialStore(null);
      const dp2 = makeMockDevicePairing({ status: "approved", token: "new-token" });
      const freshApp = await createApp(cs2, dp2);

      await ipcHandlers["device:connect"]({});
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
      const freshApp = await createApp(cs, dp);

      // No session fetch during init (no credential), so get is called only after connect.
      await ipcHandlers["device:connect"]({});
      expect(mockWebClient.get).toHaveBeenCalledWith("/api/auth/get-session", {});

      const state = (await ipcHandlers["device:state"]({})) as any;
      expect(state.pairedUserName).toBe("newuser@example.com");
    });

    test("on approval: returns the PairingResult", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "approved", token: "tok" });
      await createApp(cs, dp);

      const result = await ipcHandlers["device:connect"]({});
      expect(result).toEqual({ status: "approved", token: "tok" });
    });

    test("on declined: does NOT save token, stays unpaired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" });
      const freshApp = await createApp(cs, dp);

      await ipcHandlers["device:connect"]({});
      expect(cs.save).not.toHaveBeenCalled();
      expect((freshApp as any).paired).toBe(false);
    });

    test("on declined: returns the PairingResult", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "declined" });
      await createApp(cs, dp);

      const result = await ipcHandlers["device:connect"]({});
      expect(result).toEqual({ status: "declined" });
    });

    test("on expired: does NOT save token, stays unpaired", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "expired" });
      const freshApp = await createApp(cs, dp);

      await ipcHandlers["device:connect"]({});
      expect(cs.save).not.toHaveBeenCalled();
      expect((freshApp as any).paired).toBe(false);
    });

    test("on expired: returns the PairingResult", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing({ status: "expired" });
      await createApp(cs, dp);

      const result = await ipcHandlers["device:connect"]({});
      expect(result).toEqual({ status: "expired" });
    });
  });

  // -------------------------------------------------------------------------
  // device:disconnect IPC handler
  // -------------------------------------------------------------------------

  describe("device:disconnect handler", () => {
    test("is registered on appReady", async () => {
      const cs = makeMockCredentialStore(null);
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      expect(ipcHandlers["device:disconnect"]).toBeDefined();
    });

    test("clears credential via credentialStore.clear", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers["device:disconnect"]({});
      expect(cs.clear).toHaveBeenCalledTimes(1);
    });

    test("sets paired=false on DesktopApp", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      const freshApp = await createApp(cs, dp);

      await ipcHandlers["device:disconnect"]({});
      expect((freshApp as any).paired).toBe(false);
    });

    test("notifies webClient that paired is false", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      // Clear any setPaired calls from init.
      mockWebClient.setPaired.mockClear();

      await ipcHandlers["device:disconnect"]({});
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

      await ipcHandlers["device:disconnect"]({});
      expect((freshApp as any).pairedUserName).toBeUndefined();
    });

    test("device:state returns unpaired state after disconnect", async () => {
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers["device:disconnect"]({});
      const result = await ipcHandlers["device:state"]({});
      expect(result).toEqual({ paired: false, pairedUserName: undefined });
    });

    test("attempts sign-out via POST /api/auth/sign-out with bearer token when online", async () => {
      mockWebClient.isConnected.mockReturnValue(true);
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers["device:disconnect"]({});
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

      await ipcHandlers["device:disconnect"]({});
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(cs.clear).toHaveBeenCalledTimes(1);
    });

    test("still clears credential when sign-out POST fails", async () => {
      mockWebClient.isConnected.mockReturnValue(true);
      mockAxiosPost.mockRejectedValueOnce(new Error("network error"));
      const cs = makeMockCredentialStore("existing-token");
      const dp = makeMockDevicePairing();
      await createApp(cs, dp);

      await ipcHandlers["device:disconnect"]({});
      expect(cs.clear).toHaveBeenCalledTimes(1);
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
});
