import { useEffect } from "react";
import { useDispatch } from "react-redux";
import syncStateSlice from "../../common/state/syncStateSlice";
import {
  ON_SYNC_STATE_CHANGE,
  OnSyncStateChangePayload,
  OnErrorPayload,
  ON_ERROR
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
        if (syncStateUpdate.language)
          dispatch(
            languageSlice.actions.setTranslating(syncStateUpdate.language)
          );
      }
    );

    const unsubError = window.electronAPI.on(
      ON_ERROR,
      (error: OnErrorPayload) => {
        dispatch(bannerSlice.actions.add({ type: "Error", error }));
      }
    );

    return () => {
      unsubSync();
      unsubError();
    };
  });
}
