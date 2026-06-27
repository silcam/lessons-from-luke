/**
 * Desktop-only Redux store.
 *
 * Combines every shared reducer from common/state/ with the
 * desktop-specific desktopPairing reducer.  The web app uses the shared
 * store from common/state/appState.ts (which does not include desktopPairing).
 *
 * Consumers within desktopFrontend/ that need state.desktopPairing should
 * import useDesktopAppSelector from this module instead of useAppSelector
 * from common/state/appState.
 */
import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useSelector } from "react-redux";
import languageSlice from "../common/state/languageSlice";
import currentUserSlice from "../common/state/currentUserSlice";
import bannerSlice from "../common/banners/bannerSlice";
import loadingSlice from "../common/api/loadingSlice";
import tStringSlice from "../common/state/tStringSlice";
import lessonSlice from "../common/state/lessonSlice";
import docStringSlice from "../common/state/docStringSlice";
import networkSlice from "../common/state/networkSlice";
import docPreviewSlice from "../common/state/docPreviewSlice";
import syncStateSlice from "../common/state/syncStateSlice";
import tSubSlice from "../common/state/tSubSlice";
import desktopPairingSlice from "./desktopPairingSlice";

const reducer = combineReducers({
  languages: languageSlice.reducer,
  tStrings: tStringSlice.reducer,
  tSubs: tSubSlice.reducer,
  currentUser: currentUserSlice.reducer,
  banners: bannerSlice.reducer,
  loading: loadingSlice.reducer,
  lessons: lessonSlice.reducer,
  docStrings: docStringSlice.reducer,
  network: networkSlice.reducer,
  docPreview: docPreviewSlice.reducer,
  syncState: syncStateSlice.reducer,
  desktopPairing: desktopPairingSlice.reducer,
});

const desktopStore = configureStore({ reducer });

export type DesktopAppState = ReturnType<typeof reducer>;
export type DesktopAppDispatch = typeof desktopStore.dispatch;
export const useDesktopAppSelector: TypedUseSelectorHook<DesktopAppState> = useSelector;

export default desktopStore;
