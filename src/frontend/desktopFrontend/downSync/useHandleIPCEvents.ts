import { useEffect } from "react";
import { useDispatch } from "react-redux";
import syncStateSlice from "../../common/state/syncStateSlice";
import { ipcRenderer } from "electron";
import {
  ON_SYNC_STATE_CHANGE,
  OnSyncStateChangePayload,
  OnErrorPayload,
  ON_ERROR
} from "../../../core/api/IpcChannels";
import bannerSlice from "../../common/banners/bannerSlice";

export default function useHandleIPCEvents() {
  const dispatch = useDispatch();

  useEffect(() => {
    const syncStateChangeListener = (
      _e: any,
      syncStateUpdate: OnSyncStateChangePayload
    ) => {
      dispatch(syncStateSlice.actions.setSyncState(syncStateUpdate));
    };
    ipcRenderer.on(ON_SYNC_STATE_CHANGE, syncStateChangeListener);

    const errorListener = (_e: any, error: OnErrorPayload) => {
      console.log("ON ERROR");
      dispatch(bannerSlice.actions.add({ type: "Error", error }));
    };
    ipcRenderer.on(ON_ERROR, errorListener);

    return () => {
      ipcRenderer.removeListener(ON_SYNC_STATE_CHANGE, syncStateChangeListener);
      ipcRenderer.removeListener(ON_ERROR, errorListener);
    };
  });
}
