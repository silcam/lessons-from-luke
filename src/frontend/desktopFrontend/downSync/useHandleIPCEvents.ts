import { useEffect } from "react";
import { useDispatch } from "react-redux";
import syncStateSlice from "../../common/state/syncStateSlice";
import desktopPairingSlice from "../../common/state/desktopPairingSlice";
import {
  ON_SYNC_STATE_CHANGE,
  OnSyncStateChangePayload,
  OnErrorPayload,
  ON_ERROR,
} from "../../../core/api/IpcChannels";
import bannerSlice from "../../common/banners/bannerSlice";
import languageSlice from "../../common/state/languageSlice";

export default function useHandleIPCEvents() {
  const dispatch = useDispatch();

  useEffect(() => {
    const unsubSync = window.electronAPI.on(
      ON_SYNC_STATE_CHANGE,
      (syncStateUpdate: OnSyncStateChangePayload) => {
        dispatch(syncStateSlice.actions.setSyncState(syncStateUpdate));
        // Desktop-only pairing fields are carried alongside the SyncState fields
        // in the IPC payload. Dispatch them to the desktop-specific slice.
        if (typeof syncStateUpdate.paired === "boolean") {
          dispatch(desktopPairingSlice.actions.setPaired(syncStateUpdate.paired));
        }
        if (syncStateUpdate.pairedUserName !== undefined) {
          dispatch(desktopPairingSlice.actions.setPairedUser(syncStateUpdate.pairedUserName));
        }
        if (syncStateUpdate.language)
          dispatch(languageSlice.actions.setTranslating(syncStateUpdate.language));
      }
    );

    const unsubError = window.electronAPI.on(ON_ERROR, (error: OnErrorPayload) => {
      dispatch(bannerSlice.actions.add({ type: "Error", error }));
    });

    return () => {
      unsubSync();
      unsubError();
    };
  });
}
