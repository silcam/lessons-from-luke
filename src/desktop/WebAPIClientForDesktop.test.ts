/// <reference types="jest" />

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-data"),
    isPackaged: false
  }
}));

// Mock webGet and webPost so no real HTTP requests are made
jest.mock("../core/api/WebAPIClient", () => ({
  webGet: jest.fn(),
  webPost: jest.fn()
}));

import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import { webGet, webPost } from "../core/api/WebAPIClient";

const mockWebGet = webGet as jest.Mock;
const mockWebPost = webPost as jest.Mock;

function makeLocalStorage() {
  return {
    logDataUsed: jest.fn(),
    writeLogEntry: jest.fn()
  } as any;
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

      await expect(client.get("/api/languages", {})).rejects.toMatchObject({ type: "HTTP", status: 404 });
      expect(client.isConnected()).toBe(true);
    });

    test("logs RESPONSE SIZE message as data usage", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);

      // Simulate webGet calling the log callback with RESPONSE SIZE message
      mockWebGet.mockImplementation(async (_route: any, _params: any, _baseUrl: any, log: (msg: string) => void) => {
        log("RESPONSE SIZE 1024");
        return {};
      });

      await client.get("/api/languages", {});
      expect(localStorage.logDataUsed).toHaveBeenCalledWith(1024);
    });

    test("logs non-RESPONSE SIZE messages as Network log entries", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);

      mockWebGet.mockImplementation(async (_route: any, _params: any, _baseUrl: any, log: (msg: string) => void) => {
        log("GET /api/languages");
        return {};
      });

      await client.get("/api/languages", {});
      expect(localStorage.writeLogEntry).toHaveBeenCalledWith("Network", "GET /api/languages");
    });

    test("does not log data usage when RESPONSE SIZE value is 0 or NaN", async () => {
      const localStorage = makeLocalStorage();
      const client = new WebAPIClientForDesktop(localStorage);

      mockWebGet.mockImplementation(async (_route: any, _params: any, _baseUrl: any, log: (msg: string) => void) => {
        log("RESPONSE SIZE 0");
        return {};
      });

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
      const slowCb = jest.fn().mockImplementation(() => new Promise<void>(r => { resolve = r; }));

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
});
