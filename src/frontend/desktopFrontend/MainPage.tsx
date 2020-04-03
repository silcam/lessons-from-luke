import React from "react";
import SplashScreen from "./SplashScreen";
import TranslateHome from "../common/translate/TranslateHome";
import DownSyncPage from "./downSync/DownSyncPage";
import { useLoad } from "../common/api/useLoad";
import { loadSyncState } from "../common/state/syncStateSlice";
import { useAppSelector } from "../common/state/appState";
import useHandleIPCEvents from "./downSync/useHandleIPCEvents";

export default function MainPage() {
  const syncState = useAppSelector(state => state.syncState);

  useLoad(loadSyncState());
  useHandleIPCEvents();

  if (!syncState.loaded) return <SplashScreen />;

  // if (syncState.downSync.stage == "done" && syncState.language)
  // return <TranslateHome code={syncState.language.code} />;

  return <DownSyncPage />;
}
