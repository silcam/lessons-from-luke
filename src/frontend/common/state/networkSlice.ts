import { createSlice } from "@reduxjs/toolkit";
import { AppDispatch, AppState, useAppSelector } from "./appState";
import { GetRequest } from "../api/RequestContext";
import { useState, useEffect } from "react";

type AppAction = (dispatch: AppDispatch) => void;

interface NetworkState {
  connected: boolean;
  queuedActions: AppAction[];
}

const networkSlice = createSlice({
  name: "network",
  initialState: {
    connected: true,
    queuedActions: []
  } as NetworkState,
  reducers: {},
  extraReducers: {
    NetworkConnectionLost: (state, action: NetworkConnectionLostAction) => {
      state.connected = false;
      if (action.payload) state.queuedActions.push(action.payload);
    },
    NetworkConnectionRestored: state => {
      state.connected = true;
      state.queuedActions = [];
    }
  }
});
export default networkSlice;

type NetworkConnectionLostAction = {
  type: "NetworkConnectionLost";
  payload: AppAction | undefined;
};
export function networkConnectionLostAction(
  get: GetRequest,
  loader?: AppAction
) {
  return async (dispatch: AppDispatch, getState: () => AppState) => {
    const wasConnected = getState().network.connected;

    const action: NetworkConnectionLostAction = {
      type: "NetworkConnectionLost",
      payload: loader
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
    } catch (err) {
      // Do nothing
    }
  }, 3000);
}

function networkConnectionRestoredAction() {
  return async (dispatch: AppDispatch, getState: () => AppState) => {
    const queuedActions = getState().network.queuedActions;
    dispatch({ type: "NetworkConnectionRestored" });
    queuedActions.forEach(action => dispatch(action));
  };
}

export function useNetworkConnectionRestored() {
  const [eventHandlers, setEventHandlers] = useState<Array<() => void>>([]);
  const connected = useAppSelector(state => state.network.connected);
  useEffect(() => {
    if (connected) {
      eventHandlers.forEach(handler => handler());
      setEventHandlers([]);
    }
  }, [connected]);
  const onConnectionRestored = (handler: () => void) =>
    setEventHandlers([...eventHandlers, handler]);
  const clearHandlers = () => setEventHandlers([]);
  return { onConnectionRestored, clearHandlers };
}
