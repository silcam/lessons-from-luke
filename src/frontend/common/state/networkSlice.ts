import { createSlice } from "@reduxjs/toolkit";
import { AppDispatch, AppState, useAppSelector } from "./appState";
import { GetRequest } from "../api/RequestContext";
import { useState, useEffect } from "react";

interface NetworkState {
  connected: boolean;
}

const networkSlice = createSlice({
  name: "network",
  initialState: {
    connected: true,
  } as NetworkState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase("NetworkConnectionLost", (state) => {
        state.connected = false;
      })
      .addCase("NetworkConnectionRestored", (state) => {
        state.connected = true;
      });
  },
});
export default networkSlice;

type NetworkConnectionLostAction = {
  type: "NetworkConnectionLost";
};
export function networkConnectionLostAction(get: GetRequest) {
  return async (dispatch: AppDispatch, getState: () => AppState) => {
    const wasConnected = getState().network.connected;

    const action: NetworkConnectionLostAction = {
      type: "NetworkConnectionLost",
    };
    dispatch(action);

    if (wasConnected) {
      tryToReconnect(get, () => {
        dispatch(networkConnectionRestoredAction());
      });
    }
  };
}

async function tryToReconnect(get: GetRequest, onReconnect: () => void) {
  const timer = setInterval(async () => {
    try {
      await get("/api/users/current", {});
      clearInterval(timer);
      onReconnect();
    } catch {
      // Do nothing
    }
  }, 3000);
}

function networkConnectionRestoredAction() {
  return async (dispatch: AppDispatch) => {
    dispatch({ type: "NetworkConnectionRestored" });
  };
}

export function useNetworkConnectionRestored() {
  const [eventHandlers, setEventHandlers] = useState<Array<() => void>>([]);
  const connected = useAppSelector((state) => state.network.connected);
  useEffect(() => {
    if (connected) {
      eventHandlers.forEach((handler) => handler());
      // clear queue after firing handlers; cascading render intended
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEventHandlers([]);
    }
    // fire queued handlers only on reconnect transition; eventHandlers read via closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  const onConnectionRestored = (handler: () => void) =>
    setEventHandlers([...eventHandlers, handler]);
  const clearHandlers = () => setEventHandlers([]);
  return { onConnectionRestored, clearHandlers };
}
