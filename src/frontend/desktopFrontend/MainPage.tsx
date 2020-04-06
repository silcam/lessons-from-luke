import React, { useState } from "react";
import SplashScreen from "./SplashScreen";
import TranslateHome from "../common/translate/TranslateHome";
import DownSyncPage from "./downSync/DownSyncPage";
import { useLoad } from "../common/api/useLoad";
import { loadSyncState } from "../common/state/syncStateSlice";
import { useAppSelector } from "../common/state/appState";
import useHandleIPCEvents from "./downSync/useHandleIPCEvents";
import { readyToTranslate } from "../../core/models/SyncState";

export default function MainPage() {
  const syncState = useAppSelector(state => state.syncState);
  const canTranslate = readyToTranslate(syncState);
  const [doTranslate, setDoTranslate] = useState(canTranslate);

  useLoad(loadSyncState());
  useHandleIPCEvents();

  if (!syncState.loaded) return <SplashScreen />;

  if (doTranslate) return <TranslateHome code={syncState.language!.code} />;

  return <DownSyncPage startTranslating={() => setDoTranslate(true)} />;
}
