// Mock appState to break the circular dependency:
// networkSlice -> appState -> networkSlice
jest.mock("./appState", () => ({
  useAppSelector: jest.fn()
}));

import React, { useState } from "react";
import { render, act } from "@testing-library/react";
import networkSlice, {
  networkConnectionLostAction,
  useNetworkConnectionRestored
} from "./networkSlice";
import { useAppSelector } from "./appState";

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

  it("dispatches NetworkConnectionRestored after successful reconnect poll", async () => {
    const get = jest.fn().mockRejectedValue(new Error("network error"));
    const dispatch = jest.fn();
    const getState = jest.fn().mockReturnValue({ network: { connected: true } });

    await networkConnectionLostAction(get)(dispatch, getState);

    // Now the server is reachable
    get.mockResolvedValue({ id: 1, admin: false });
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The restored action is itself a thunk — check it was dispatched
    const dispatchedThunks = dispatch.mock.calls.filter(
      ([action]) => typeof action === "function"
    );
    expect(dispatchedThunks.length).toBeGreaterThan(0);
  });

  it("retries polling until connection is restored", async () => {
    const get = jest.fn().mockRejectedValue(new Error("network error"));
    const dispatch = jest.fn();
    const getState = jest.fn().mockReturnValue({ network: { connected: true } });

    await networkConnectionLostAction(get)(dispatch, getState);

    // First tick — still failing (get is only called inside the timer interval)
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();

    expect(get).toHaveBeenCalledTimes(1); // 1 poll so far

    // Second tick — now succeeds
    get.mockResolvedValue({ id: 1, admin: false });
    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(get).toHaveBeenCalledTimes(2); // 2 polls total
  });
});

describe("useNetworkConnectionRestored hook", () => {
  const mockUseAppSelector = useAppSelector as jest.Mock;

  // Helper: renders a component that exposes the hook return value via callbacks
  function renderHookViaComponent(
    connected: boolean,
    onMount: (api: ReturnType<typeof useNetworkConnectionRestored>) => void
  ) {
    mockUseAppSelector.mockReturnValue(connected);

    let hookApi: ReturnType<typeof useNetworkConnectionRestored> | undefined;

    function TestComponent({ isConnected }: { isConnected: boolean }) {
      mockUseAppSelector.mockReturnValue(isConnected);
      hookApi = useNetworkConnectionRestored();
      return null;
    }

    const { rerender } = render(React.createElement(TestComponent, { isConnected: connected }));

    onMount(hookApi!);

    return {
      rerender: (isConnected: boolean) =>
        rerender(React.createElement(TestComponent, { isConnected })),
      getApi: () => hookApi!
    };
  }

  it("returns onConnectionRestored and clearHandlers functions", () => {
    mockUseAppSelector.mockReturnValue(true);

    let api: ReturnType<typeof useNetworkConnectionRestored> | undefined;
    function TestComponent() {
      api = useNetworkConnectionRestored();
      return null;
    }

    act(() => {
      render(React.createElement(TestComponent));
    });

    expect(typeof api!.onConnectionRestored).toBe("function");
    expect(typeof api!.clearHandlers).toBe("function");
  });

  it("calls registered handlers when connected transitions from false to true", () => {
    const handler = jest.fn();
    let api: ReturnType<typeof useNetworkConnectionRestored> | undefined;

    function TestComponent({ isConnected }: { isConnected: boolean }) {
      mockUseAppSelector.mockReturnValue(isConnected);
      api = useNetworkConnectionRestored();
      return null;
    }

    const { rerender } = render(
      React.createElement(TestComponent, { isConnected: false })
    );

    act(() => {
      api!.onConnectionRestored(handler);
    });

    act(() => {
      rerender(React.createElement(TestComponent, { isConnected: true }));
    });

    expect(handler).toHaveBeenCalled();
  });

  it("does not call handlers again after they have been cleared on reconnect", () => {
    const handler = jest.fn();
    let api: ReturnType<typeof useNetworkConnectionRestored> | undefined;

    function TestComponent({ isConnected }: { isConnected: boolean }) {
      mockUseAppSelector.mockReturnValue(isConnected);
      api = useNetworkConnectionRestored();
      return null;
    }

    const { rerender } = render(
      React.createElement(TestComponent, { isConnected: false })
    );

    act(() => {
      api!.onConnectionRestored(handler);
    });

    // First reconnect — handler fires and list is cleared
    act(() => {
      rerender(React.createElement(TestComponent, { isConnected: true }));
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Disconnect again, reconnect — handler should NOT fire (was cleared)
    act(() => {
      rerender(React.createElement(TestComponent, { isConnected: false }));
    });
    act(() => {
      rerender(React.createElement(TestComponent, { isConnected: true }));
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("clearHandlers removes all registered handlers before reconnect", () => {
    const handler = jest.fn();
    let api: ReturnType<typeof useNetworkConnectionRestored> | undefined;

    function TestComponent({ isConnected }: { isConnected: boolean }) {
      mockUseAppSelector.mockReturnValue(isConnected);
      api = useNetworkConnectionRestored();
      return null;
    }

    const { rerender } = render(
      React.createElement(TestComponent, { isConnected: false })
    );

    act(() => {
      api!.onConnectionRestored(handler);
      api!.clearHandlers();
    });

    act(() => {
      rerender(React.createElement(TestComponent, { isConnected: true }));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
