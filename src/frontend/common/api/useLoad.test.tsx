import React from "react";
import { act } from "@testing-library/react";
import { renderHook } from "../testRenderHook";
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import RequestContext from "./RequestContext";
import { useJustLoad, useLoad, usePush, Loader, Pusher } from "./useLoad";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "./loadingSlice";

// Mock the entire networkSlice module to avoid circular-dependency issue
// (networkSlice imports appState which imports networkSlice)
jest.mock("../state/networkSlice", () => ({
  __esModule: true,
  default: {
    reducer: (state = { connected: true }) => state
  },
  networkConnectionLostAction: jest.fn(() => ({ type: "NetworkConnectionLost" })),
  useNetworkConnectionRestored: () => ({
    onConnectionRestored: jest.fn(),
    clearHandlers: jest.fn()
  })
}));

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      banners: bannerSlice.reducer,
      loading: loadingSlice.reducer,
      network: (state = { connected: true }) => state
    })
  });

const createWrapper = (
  mockGet = jest.fn().mockResolvedValue(null),
  mockPost = jest.fn().mockResolvedValue(null)
) => {
  const store = createTestStore();
  const Wrapper: React.FC = ({ children }) => (
    <Provider store={store}>
      <RequestContext.Provider value={{ get: mockGet as any, post: mockPost as any }}>
        {children}
      </RequestContext.Provider>
    </Provider>
  );
  return { Wrapper, store };
};

describe("useJustLoad", () => {
  it("returns [load function, false] initially", () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useJustLoad(), { wrapper: Wrapper });
    const [load, loading] = result.current;
    expect(typeof load).toBe("function");
    expect(loading).toBe(false);
  });

  it("sets loading to true during load, then false after completion", async () => {
    let resolveLoader!: (val: any) => void;
    const loaderPromise = new Promise(res => {
      resolveLoader = res;
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useJustLoad(), { wrapper: Wrapper });

    const loader: Loader<any> = _get => _dispatch => loaderPromise;

    act(() => {
      result.current[0](loader);
    });

    expect(result.current[1]).toBe(true);

    await act(async () => {
      resolveLoader(null);
      await loaderPromise;
    });

    expect(result.current[1]).toBe(false);
  });

  it("dispatches banner error when loader rejects with generic error", async () => {
    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => useJustLoad(), { wrapper: Wrapper });

    const loader: Loader<any> = _get => _dispatch =>
      Promise.reject(new Error("Something went wrong"));

    await act(async () => {
      result.current[0](loader);
    });

    const banners = store.getState().banners;
    expect(banners.length).toBeGreaterThan(0);
    expect(banners[0].type).toBe("Error");
  });

  it("does not dispatch banner when errorHandler returns true", async () => {
    const { Wrapper, store } = createWrapper();
    const errorHandler = jest.fn().mockReturnValue(true);
    const { result } = renderHook(() => useJustLoad(errorHandler), {
      wrapper: Wrapper
    });

    const loader: Loader<any> = _get => _dispatch =>
      Promise.reject(new Error("Handled error"));

    await act(async () => {
      result.current[0](loader);
    });

    expect(errorHandler).toHaveBeenCalled();
    const banners = store.getState().banners;
    expect(banners.length).toBe(0);
  });
});

describe("useLoad", () => {
  it("calls loader automatically on mount", async () => {
    const loaderImpl = jest.fn().mockResolvedValue(null);
    const loader: Loader<any> = _get => _dispatch => loaderImpl();

    const { Wrapper } = createWrapper();
    await act(async () => {
      renderHook(() => useLoad(loader), { wrapper: Wrapper });
    });

    expect(loaderImpl).toHaveBeenCalledTimes(1);
  });

  it("returns true (loading) initially then false after completion", async () => {
    let resolveLoader!: (val: any) => void;
    const loaderPromise = new Promise(res => {
      resolveLoader = res;
    });

    const loader: Loader<any> = _get => _dispatch => loaderPromise;
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useLoad(loader), { wrapper: Wrapper });

    // Initially true (notYetStarted)
    expect(result.current).toBe(true);

    await act(async () => {
      resolveLoader(null);
      await loaderPromise;
    });

    expect(result.current).toBe(false);
  });
});

describe("usePush", () => {
  it("calls the pusher function and returns a promise", async () => {
    const pusherResult = { id: 1 };
    const pusher: Pusher<any> = jest.fn().mockResolvedValue(pusherResult);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => usePush(), { wrapper: Wrapper });

    let returnValue: any;
    await act(async () => {
      returnValue = await result.current(pusher);
    });

    expect(pusher).toHaveBeenCalled();
    expect(returnValue).toEqual(pusherResult);
  });

  it("dispatches banner error when pusher rejects", async () => {
    const pusher: Pusher<any> = jest.fn().mockRejectedValue(new Error("Push failed"));

    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => usePush(), { wrapper: Wrapper });

    await act(async () => {
      await result.current(pusher);
    });

    const banners = store.getState().banners;
    expect(banners.length).toBeGreaterThan(0);
    expect(banners[0].type).toBe("Error");
  });

  it("does not dispatch banner when errorHandler handles the error", async () => {
    const pusher: Pusher<any> = jest.fn().mockRejectedValue(new Error("Handled"));
    const errorHandler = jest.fn().mockReturnValue(true);

    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => usePush(), { wrapper: Wrapper });

    await act(async () => {
      await result.current(pusher, errorHandler);
    });

    expect(errorHandler).toHaveBeenCalled();
    const banners = store.getState().banners;
    expect(banners.length).toBe(0);
  });

  it("updates loading state during push", async () => {
    let resolvePusher!: (val: any) => void;
    const pusherPromise = new Promise(res => {
      resolvePusher = res;
    });
    const pusher: Pusher<any> = jest.fn().mockReturnValue(pusherPromise);

    const { Wrapper, store } = createWrapper();
    const { result } = renderHook(() => usePush(), { wrapper: Wrapper });

    act(() => {
      result.current(pusher);
    });

    expect(store.getState().loading).toBeGreaterThan(0);

    await act(async () => {
      resolvePusher(null);
      await pusherPromise;
    });

    expect(store.getState().loading).toBe(0);
  });
});
