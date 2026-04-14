// Mock appState to break the circular dependency:
// networkSlice -> appState -> networkSlice
jest.mock("./appState", () => ({
  useAppSelector: jest.fn()
}));

import networkSlice, { networkConnectionLostAction } from "./networkSlice";

// The networkSlice uses extraReducers keyed by action type strings.
// We test by dispatching plain action objects with the matching types.

const connectedState = { connected: true };
const disconnectedState = { connected: false };

describe("networkSlice extraReducers", () => {
  describe("NetworkConnectionLost", () => {
    it("sets connected to false", () => {
      const state = networkSlice.reducer(
        connectedState,
        { type: "NetworkConnectionLost" }
      );

      expect(state.connected).toBe(false);
    });

    it("is idempotent when already disconnected", () => {
      const state = networkSlice.reducer(
        disconnectedState,
        { type: "NetworkConnectionLost" }
      );

      expect(state.connected).toBe(false);
    });
  });

  describe("NetworkConnectionRestored", () => {
    it("sets connected to true", () => {
      const state = networkSlice.reducer(
        disconnectedState,
        { type: "NetworkConnectionRestored" }
      );

      expect(state.connected).toBe(true);
    });

    it("is idempotent when already connected", () => {
      const state = networkSlice.reducer(
        connectedState,
        { type: "NetworkConnectionRestored" }
      );

      expect(state.connected).toBe(true);
    });
  });

  describe("initial state", () => {
    it("starts with connected=true", () => {
      const state = networkSlice.reducer(undefined, { type: "@@INIT" });

      expect(state.connected).toBe(true);
    });
  });
});

describe("networkConnectionLostAction thunk", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("dispatches NetworkConnectionLost when called", async () => {
    const get = jest.fn().mockRejectedValue(new Error("network error"));
    const dispatch = jest.fn();
    const getState = jest.fn().mockReturnValue({ network: { connected: true } });

    await networkConnectionLostAction(get)(dispatch, getState);

    expect(dispatch).toHaveBeenCalledWith({ type: "NetworkConnectionLost" });
  });

  it("starts reconnection polling when previously connected", async () => {
    const get = jest.fn().mockRejectedValue(new Error("network error"));
    const dispatch = jest.fn();
    const getState = jest.fn().mockReturnValue({ network: { connected: true } });

    await networkConnectionLostAction(get)(dispatch, getState);

    // Let the reconnect timer fire and resolve
    get.mockResolvedValue({ id: 1, admin: false });
    jest.advanceTimersByTime(3000);
    // Allow promises to resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(get).toHaveBeenCalledWith("/api/users/current", {});
  });

  it("does not start reconnection polling when already disconnected", async () => {
    const get = jest.fn();
    const dispatch = jest.fn();
    const getState = jest.fn().mockReturnValue({ network: { connected: false } });

    await networkConnectionLostAction(get)(dispatch, getState);

    // Advance timers — no interval should have been set
    jest.advanceTimersByTime(10000);

    // get should not have been called for reconnection
    expect(get).not.toHaveBeenCalled();
  });
});
