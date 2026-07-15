import { useEffect } from "react";
import { useDispatch } from "react-redux";
import syncStateSlice from "../../common/state/syncStateSlice";
import desktopPairingSlice from "../desktopPairingSlice";
import {
  ON_SYNC_STATE_CHANGE,
  OnSyncStateChangePayload,
  DesktopPairingIpcFields,
  OnErrorPayload,
  ON_ERROR,
  DEVICE_STATE,
} from "../../../core/api/IpcChannels";
import bannerSlice from "../../common/banners/bannerSlice";
import languageSlice from "../../common/state/languageSlice";

export default function useHandleIPCEvents() {
  const dispatch = useDispatch();

  // Pull the authoritative pairing state once on mount. The ON_SYNC_STATE_CHANGE
  // push that carries `paired` only fires on connection/pairing *changes*, which
  // can happen before this renderer has mounted and registered its listener
  // (especially at startup). Without this initial query, a device that booted
  // already paired would miss that push and stay stuck on the connect prompt.
  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .invoke(DEVICE_STATE)
      .then((state: DesktopPairingIpcFields) => {
        if (cancelled || typeof state?.paired !== "boolean") return;
        dispatch(desktopPairingSlice.actions.setPaired(state.paired));
        dispatch(desktopPairingSlice.actions.setPairedUser(state.pairedUserName));
      })
      .catch(() => {
        // Best-effort: a missing/failed device:state query leaves the slice at its
        // unpaired default, which the change-pushes above will correct on the next
        // pairing or connection event.
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    const unsubSync = window.electronAPI.on(
      ON_SYNC_STATE_CHANGE,
      (syncStateUpdate: OnSyncStateChangePayload & DesktopPairingIpcFields) => {
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
