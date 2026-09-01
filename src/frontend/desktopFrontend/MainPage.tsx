import React, { useState } from "react";
import SplashScreen from "./SplashScreen";
import TranslateHome from "../common/translate/TranslateHome";
import DownSyncPage from "./downSync/DownSyncPage";
import { useLoad } from "../common/api/useLoad";
import { loadSyncState } from "../common/state/syncStateSlice";
import { useAppSelector } from "../common/state/appState";
import { useDesktopAppSelector } from "./desktopAppState";
import useHandleIPCEvents from "./downSync/useHandleIPCEvents";

export default function MainPage() {
  const syncState = useAppSelector((state) => state.syncState);

  useLoad(loadSyncState());
  useHandleIPCEvents();

  if (!syncState.loaded) return <SplashScreen />;

  return <MainPageWithSyncStateLoaded />;
}

function MainPageWithSyncStateLoaded() {
  const syncState = useAppSelector((state) => state.syncState);
  const { paired } = useDesktopAppSelector((state) => state.desktopPairing);
  const [doTranslate, setDoTranslate] = useState(syncState.downSync.progress == 100);

  // Gate the translation UI on the live `paired` flag as well as `doTranslate`.
  // `doTranslate` is a one-time init, so without `&& paired` an un-pair mid-
  // session (Admin > Disconnect Account) would leave the user stranded on the
  // translation screen. When un-paired, fall through to DownSyncPage, which
  // surfaces the "Connect to account" gate (FR-015).
  if (doTranslate && paired) return <TranslateHome code={syncState.language!.code} />;

  return <DownSyncPage startTranslating={() => setDoTranslate(true)} />;
}
