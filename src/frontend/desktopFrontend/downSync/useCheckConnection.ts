import { useAppSelector } from "../../common/state/appState";
import { useEffect, useContext } from "react";
import RequestContext from "../../common/api/RequestContext";
import { useDispatch } from "react-redux";
import syncStateSlice from "../../common/state/syncStateSlice";

const CHECK_INTERVAL = 1000;

export default function useCheckConnection() {
  const { get } = useContext(RequestContext);
  const dispatch = useDispatch();

  const connected = useAppSelector(state => state.syncState.connected);

  useEffect(() => {
    const intervalId = setInterval(async () => {
      const syncState = await get("/api/syncState", {});
      if (syncState && syncState.connected !== connected) {
        dispatch(syncStateSlice.actions.setSyncState(syncState));
      }
    }, CHECK_INTERVAL);
    return () => {
      clearInterval(intervalId);
    };
  });
}
