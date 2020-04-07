import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  initalStoredSyncState,
  SyncState
} from "../../../core/models/SyncState";
import { Loader, Pusher } from "../api/useLoad";
import languageSlice from "./languageSlice";
import { Locale } from "../../../core/i18n/I18n";

const syncStateSlice = createSlice({
  name: "syncState",
  initialState: {
    ...initalStoredSyncState(),
    connected: false,
    loaded: false
  } as SyncState,
  reducers: {
    setSyncState: (state, action: PayloadAction<Partial<SyncState>>) => ({
      ...state,
      ...action.payload
    })
  }
});

export default syncStateSlice;

export function loadSyncState(): Loader<SyncState | null> {
  return get => async dispatch => {
    const syncState = await get("/api/syncState", {});
    if (syncState) {
      dispatch(syncStateSlice.actions.setSyncState(syncState));
      if (syncState.language)
        dispatch(languageSlice.actions.setTranslating(syncState.language));
    }
    return syncState;
  };
}

export function pushCode(code: string): Pusher<SyncState | null> {
  return async (post, dispatch) => {
    const syncState = await post("/api/syncState/code", {}, { code });
    if (syncState) dispatch(syncStateSlice.actions.setSyncState(syncState));
    return syncState;
  };
}

export function pushLocale(locale: Locale): Pusher<void> {
  return async (post, dispatch) => {
    const syncState = await post("/api/syncState/locale", {}, { locale });
    if (syncState) dispatch(syncStateSlice.actions.setSyncState(syncState));
  };
}
