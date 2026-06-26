/// <reference types="jest" />

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-data"),
    isPackaged: false,
  },
}));

// Mock webGet and webPost so no real HTTP requests are made
jest.mock("../core/api/WebAPIClient", () => ({
  webGet: jest.fn(),
  webPost: jest.fn(),
}));

import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import { webGet, webPost } from "../core/api/WebAPIClient";

const mockWebGet = webGet as jest.Mock;
const mockWebPost = webPost as jest.Mock;

function makeLocalStorage() {
  return {
    logDataUsed: jest.fn(),
    writeLogEntry: jest.fn(),
  } as any;
}

function makeCredentialStore(token: string | null = null) {
  return {
    load: jest.fn().mockResolvedValue(token),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeSessionFetcher() {
  return jest.fn().mockResolvedValue(undefined);
}

describe("WebAPIClientForDesktop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    test("creates an instance with isConnected initially false", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("isConnected / setConnected", () => {
    test("setConnected(true) changes isConnected to true", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      client.setConnected(true);
      expect(client.isConnected()).toBe(true);
    });

    test("setConnected(false) after true changes isConnected to false", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      client.setConnected(true);
      client.setConnected(false);
      expect(client.isConnected()).toBe(false);
    });

    test("setConnected does not fire listeners if value has not changed", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.onConnectionChange(listener);

      client.setConnected(false); // starts as false, so no change
      expect(listener).not.toHaveBeenCalled();
    });

    test("setConnected fires listeners when value changes from false to true", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.onConnectionChange(listener);

      client.setConnected(true);
      expect(listener).toHaveBeenCalledWith(true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("setConnected fires listeners when value changes from true to false", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.setConnected(true);
      client.onConnectionChange(listener);

      client.setConnected(false);
      expect(listener).toHaveBeenCalledWith(false);
    });
  });

  describe("onConnectionChange / removeOnConnectionChangeListener", () => {
    test("multiple listeners all receive the connection change event", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      client.onConnectionChange(listener1);
      client.onConnectionChange(listener2);

      client.setConnected(true);
      expect(listener1).toHaveBeenCalledWith(true);
      expect(listener2).toHaveBeenCalledWith(true);
    });

    test("removeOnConnectionChangeListener stops listener from receiving events", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.onConnectionChange(listener);
      client.removeOnConnectionChangeListener(listener);

      client.setConnected(true);
      expect(listener).not.toHaveBeenCalled();
    });

    test("removing one listener does not affect other listeners", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      client.onConnectionChange(listener1);
      client.onConnectionChange(listener2);
      client.removeOnConnectionChangeListener(listener1);

      client.setConnected(true);
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(true);
    });
  });

  describe("get()", () => {
    test("returns result from webGet and sets connected=true on success", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);
      mockWebGet.mockResolvedValue({ languages: [], timestamp: 1 });

      const result = await client.get("/api/languages", {});
      expect(result).toEqual({ languages: [], timestamp: 1 });
      expect(client.isConnected()).toBe(true);
    });

    test("returns null and sets connected=false on No Connection error", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);
      mockWebGet.mockRejectedValue({ type: "No Connection", log: "ECONNREFUSED" });

      const result = await client.get("/api/languages", {});
      expect(result).toBeNull();
      expect(client.isConnected()).toBe(false);
    });

    test("sets connected=true and rethrows on HTTP error", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);
      mockWebGet.mockRejectedValue({ type: "HTTP", status: 404 });

      await expect(client.get("/api/languages", {})).rejects.toMatchObject({
        type: "HTTP",
        status: 404,
      });
      expect(client.isConnected()).toBe(true);
    });

    test("logs RESPONSE SIZE message as data usage", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);

      // Simulate webGet calling the log callback with RESPONSE SIZE message
      mockWebGet.mockImplementation(
        async (_route: any, _params: any, _baseUrl: any, log: (msg: string) => void) => {
          log("RESPONSE SIZE 1024");
          return {};
        }
      );

      await client.get("/api/languages", {});
      expect(localStorage.logDataUsed).toHaveBeenCalledWith(1024);
    });

    test("logs non-RESPONSE SIZE messages as Network log entries", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);

      mockWebGet.mockImplementation(
        async (_route: any, _params: any, _baseUrl: any, log: (msg: string) => void) => {
          log("GET /api/languages");
          return {};
        }
      );

      await client.get("/api/languages", {});
      expect(localStorage.writeLogEntry).toHaveBeenCalledWith("Network", "GET /api/languages");
    });

    test("does not log data usage when RESPONSE SIZE value is 0 or NaN", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);

      mockWebGet.mockImplementation(
        async (_route: any, _params: any, _baseUrl: any, log: (msg: string) => void) => {
          log("RESPONSE SIZE 0");
          return {};
        }
      );

      await client.get("/api/languages", {});
      expect(localStorage.logDataUsed).not.toHaveBeenCalled();
    });
  });

  describe("post()", () => {
    test("returns result from webPost and sets connected=true on success", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);
      const savedTStrings = [{ masterId: 1, languageId: 10, text: "Hello", history: [] }];
      mockWebPost.mockResolvedValue(savedTStrings);

      const result = await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });
      expect(result).toEqual(savedTStrings);
      expect(client.isConnected()).toBe(true);
    });

    test("returns null and sets connected=false on No Connection error", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);
      mockWebPost.mockRejectedValue({ type: "No Connection", log: "ECONNREFUSED" });

      const result = await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });
      expect(result).toBeNull();
      expect(client.isConnected()).toBe(false);
    });

    test("rethrows non-connection errors", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);
      mockWebPost.mockRejectedValue({ type: "HTTP", status: 500 });

      await expect(
        client.post("/api/tStrings", {}, { code: "btg", tStrings: [] })
      ).rejects.toMatchObject({ type: "HTTP", status: 500 });
    });
  });

  describe("watch()", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("calls callback after interval fires", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const cb = jest.fn().mockResolvedValue(undefined);

      client.watch(cb);
      jest.advanceTimersByTime(3000);

      // Give promises time to settle
      await Promise.resolve();
      expect(cb).toHaveBeenCalledWith(client);
    });

    test("does not overlap callback invocations (watchLock)", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      let resolve: () => void;
      const slowCb = jest.fn().mockImplementation(
        () =>
          new Promise<void>((r) => {
            resolve = r;
          })
      );

      client.watch(slowCb);

      // Fire the interval twice quickly
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
      await Promise.resolve();

      // Second invocation should not have happened while first is still running
      expect(slowCb).toHaveBeenCalledTimes(1);

      // Resolve the first and allow the next tick
      resolve!();
      await Promise.resolve();
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      expect(slowCb).toHaveBeenCalledTimes(2);
    });

    test("replaces existing timer when watch is called again", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const cb1 = jest.fn().mockResolvedValue(undefined);
      const cb2 = jest.fn().mockResolvedValue(undefined);

      client.watch(cb1);
      client.watch(cb2);

      jest.advanceTimersByTime(3000);
      await Promise.resolve();

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  describe("isPaired / setPaired / onPairedChange", () => {
    test("isPaired() starts as false", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      expect(client.isPaired()).toBe(false);
    });

    test("setPaired(true) changes isPaired to true", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      client.setPaired(true);
      expect(client.isPaired()).toBe(true);
    });

    test("setPaired(false) after true changes isPaired to false", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      client.setPaired(true);
      client.setPaired(false);
      expect(client.isPaired()).toBe(false);
    });

    test("setPaired fires listeners when value changes to true", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.onPairedChange(listener);
      client.setPaired(true);
      expect(listener).toHaveBeenCalledWith(true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("setPaired does not fire listeners if value has not changed", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.onPairedChange(listener);
      client.setPaired(false); // starts as false — no change
      expect(listener).not.toHaveBeenCalled();
    });

    test("removeOnPairedChangeListener stops listener from receiving events", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener = jest.fn();
      client.onPairedChange(listener);
      client.removeOnPairedChangeListener(listener);
      client.setPaired(true);
      expect(listener).not.toHaveBeenCalled();
    });

    test("removing one paired listener does not affect other paired listeners", () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      client.onPairedChange(listener1);
      client.onPairedChange(listener2);
      client.removeOnPairedChangeListener(listener1);
      client.setPaired(true);
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(true);
    });
  });

  describe("Authorization header injection", () => {
    test("injects Authorization header in GET when token is present", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      mockWebGet.mockResolvedValue({ languages: [], timestamp: 1 });

      await client.get("/api/languages", {});

      expect(mockWebGet).toHaveBeenCalledWith(
        "/api/languages",
        {},
        expect.any(String),
        expect.any(Function),
        { Authorization: "Bearer my-secret-token" }
      );
    });

    test("does not inject Authorization header in GET when token is null", async () => {
      const credStore = makeCredentialStore(null);
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      mockWebGet.mockResolvedValue({ languages: [], timestamp: 1 });

      await client.get("/api/languages", {});

      expect(mockWebGet).toHaveBeenCalledWith(
        "/api/languages",
        {},
        expect.any(String),
        expect.any(Function),
        undefined
      );
    });

    test("does not inject Authorization header in GET when no credential store", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      mockWebGet.mockResolvedValue({ languages: [], timestamp: 1 });

      await client.get("/api/languages", {});

      expect(mockWebGet).toHaveBeenCalledWith(
        "/api/languages",
        {},
        expect.any(String),
        expect.any(Function),
        undefined
      );
    });

    test("injects Authorization header in POST when token is present", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      mockWebPost.mockResolvedValue([]);

      await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });

      expect(mockWebPost).toHaveBeenCalledWith(
        "/api/tStrings",
        {},
        { code: "btg", tStrings: [] },
        expect.any(String),
        expect.any(Function),
        { Authorization: "Bearer my-secret-token" }
      );
    });

    test("does not inject Authorization header in POST when token is null", async () => {
      const credStore = makeCredentialStore(null);
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      mockWebPost.mockResolvedValue([]);

      await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });

      expect(mockWebPost).toHaveBeenCalledWith(
        "/api/tStrings",
        {},
        { code: "btg", tStrings: [] },
        expect.any(String),
        expect.any(Function),
        undefined
      );
    });

    test("does not inject Authorization header in POST when no credential store", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      mockWebPost.mockResolvedValue([]);

      await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });

      expect(mockWebPost).toHaveBeenCalledWith(
        "/api/tStrings",
        {},
        { code: "btg", tStrings: [] },
        expect.any(String),
        expect.any(Function),
        undefined
      );
    });
  });

  describe("401 handling", () => {
    test("401 GET response clears credential and sets paired=false, returns null", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      client.setPaired(true);
      mockWebGet.mockRejectedValue({ type: "HTTP", status: 401 });

      const listener = jest.fn();
      client.onPairedChange(listener);

      const result = await client.get("/api/languages", {});

      expect(result).toBeNull();
      expect(credStore.clear).toHaveBeenCalled();
      expect(client.isPaired()).toBe(false);
      expect(listener).toHaveBeenCalledWith(false);
    });

    test("401 POST response clears credential and sets paired=false, returns null", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      client.setPaired(true);
      mockWebPost.mockRejectedValue({ type: "HTTP", status: 401 });

      const result = await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });

      expect(result).toBeNull();
      expect(credStore.clear).toHaveBeenCalled();
      expect(client.isPaired()).toBe(false);
    });

    test("401 does not rethrow — resolves to null", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage(), makeCredentialStore("token"));
      mockWebGet.mockRejectedValue({ type: "HTTP", status: 401 });

      await expect(client.get("/api/languages", {})).resolves.toBeNull();
    });

    test("401 without credential store still sets paired=false and returns null", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      client.setPaired(true);
      mockWebGet.mockRejectedValue({ type: "HTTP", status: 401 });

      const result = await client.get("/api/languages", {});

      expect(result).toBeNull();
      expect(client.isPaired()).toBe(false);
    });

    test("non-401 HTTP error still rethrows (e.g. 404)", async () => {
      const client = new WebAPIClientForDesktop(makeLocalStorage());
      mockWebGet.mockRejectedValue({ type: "HTTP", status: 404 });

      await expect(client.get("/api/languages", {})).rejects.toMatchObject({
        type: "HTTP",
        status: 404,
      });
    });
  });

  describe("mid-sync 401 abort", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("first 401 during a sync pass prevents subsequent get() calls from making HTTP requests", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      client.setPaired(true);

      // First call: 401 — sets syncAborted
      mockWebGet.mockRejectedValueOnce({ type: "HTTP", status: 401 });
      const result1 = await client.get("/api/languages", {});
      expect(result1).toBeNull();

      // Second call in same sync pass: must not call webGet again
      const result2 = await client.get("/api/languages", {});
      expect(result2).toBeNull();
      expect(mockWebGet).toHaveBeenCalledTimes(1);
    });

    test("first 401 during a sync pass prevents subsequent post() calls from making HTTP requests", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      client.setPaired(true);

      // First call: 401 — sets syncAborted
      mockWebGet.mockRejectedValueOnce({ type: "HTTP", status: 401 });
      await client.get("/api/languages", {});

      // Subsequent post in same pass: must not call webPost
      const result = await client.post("/api/tStrings", {}, { code: "btg", tStrings: [] });
      expect(result).toBeNull();
      expect(mockWebPost).not.toHaveBeenCalled();
    });

    test("syncAborted flag is reset between sync passes so the next pass makes real HTTP requests", async () => {
      const mockFetcher = makeSessionFetcher();
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore, mockFetcher);
      client.setPaired(true);
      client.setConnected(true);

      client.watch(async (c) => {
        mockWebGet.mockRejectedValueOnce({ type: "HTTP", status: 401 });
        await c.get("/api/languages", {});
      });

      // First tick: 401 fires, syncAborted = true
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockWebGet).toHaveBeenCalledTimes(1);

      // Second tick: syncAborted is reset; webGet is called again
      mockWebGet.mockResolvedValueOnce({ languages: [], timestamp: 2 });
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockWebGet).toHaveBeenCalledTimes(2);
    });

    test("401 sets paired=false and clears credential before remaining requests are skipped", async () => {
      const credStore = makeCredentialStore("my-secret-token");
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore);
      client.setPaired(true);

      const pairedListener = jest.fn();
      client.onPairedChange(pairedListener);

      mockWebGet.mockRejectedValueOnce({ type: "HTTP", status: 401 });
      await client.get("/api/languages", {});

      expect(credStore.clear).toHaveBeenCalled();
      expect(client.isPaired()).toBe(false);
      expect(pairedListener).toHaveBeenCalledWith(false);

      // Subsequent get: skipped (syncAborted), credential already cleared
      await client.get("/api/languages", {});
      expect(mockWebGet).toHaveBeenCalledTimes(1);
    });
  });

  describe("session keep-alive", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("keep-alive fires on first watch tick when online and paired, but not again within 24h window", async () => {
      const mockFetcher = makeSessionFetcher();
      const client = new WebAPIClientForDesktop(
        makeLocalStorage(),
        makeCredentialStore("token"),
        mockFetcher
      );
      client.setConnected(true);
      client.setPaired(true);

      client.watch(async () => {});

      // First tick: keep-alive fires
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Second tick within 24h: keep-alive does NOT fire again
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    test("keep-alive does not fire when not connected", async () => {
      const mockFetcher = makeSessionFetcher();
      const client = new WebAPIClientForDesktop(
        makeLocalStorage(),
        makeCredentialStore("token"),
        mockFetcher
      );
      client.setConnected(false);
      client.setPaired(true);

      client.watch(async () => {});
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockFetcher).not.toHaveBeenCalled();
    });

    test("keep-alive does not fire when not paired", async () => {
      const mockFetcher = makeSessionFetcher();
      const client = new WebAPIClientForDesktop(
        makeLocalStorage(),
        makeCredentialStore("token"),
        mockFetcher
      );
      client.setConnected(true);
      client.setPaired(false);

      client.watch(async () => {});
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockFetcher).not.toHaveBeenCalled();
    });

    test("keep-alive fires again after the keep-alive window elapses", async () => {
      // Use a 9-second window so tests can exercise the boundary with small timer advances
      const KEEP_ALIVE_WINDOW = 9000;
      const mockFetcher = makeSessionFetcher();
      const client = new WebAPIClientForDesktop(
        makeLocalStorage(),
        makeCredentialStore("token"),
        mockFetcher,
        KEEP_ALIVE_WINDOW
      );
      client.setConnected(true);
      client.setPaired(true);

      client.watch(async () => {});

      // First tick (3s): fires
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Second tick (6s): 6s < 9s window — does NOT fire again
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Third tick (9s): exactly at boundary, still < window (strict less-than) — does NOT fire
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Fourth tick (12s): 12s > 9s window — fires again
      await jest.advanceTimersByTimeAsync(3000);
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    test("keep-alive 401 response clears credential and sets paired=false", async () => {
      const credStore = makeCredentialStore("token");
      const mockFetcher = jest.fn().mockRejectedValue({ type: "HTTP", status: 401 });
      const client = new WebAPIClientForDesktop(makeLocalStorage(), credStore, mockFetcher);
      client.setConnected(true);
      client.setPaired(true);

      client.watch(async () => {});
      await jest.advanceTimersByTimeAsync(3000);

      expect(credStore.clear).toHaveBeenCalled();
      expect(client.isPaired()).toBe(false);
    });

    test("keep-alive does not fire if no credentialStore provided", async () => {
      const mockFetcher = makeSessionFetcher();
      // No credentialStore — 3rd param sessionFetcher is injected, but credentialStore is undefined
      const client = new WebAPIClientForDesktop(makeLocalStorage(), undefined, mockFetcher);
      client.setConnected(true);
      client.setPaired(true);

      client.watch(async () => {});
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockFetcher).not.toHaveBeenCalled();
    });
  });
});
