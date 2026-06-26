import { configureStore, combineReducers } from "@reduxjs/toolkit";
import languageSlice from "./languageSlice";
import currentUserSlice from "./currentUserSlice";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "../api/loadingSlice";
import { TypedUseSelectorHook, useSelector } from "react-redux";
import tStringSlice from "./tStringSlice";
import lessonSlice from "./lessonSlice";
import docStringSlice from "./docStringSlice";
import networkSlice from "./networkSlice";
import docPreviewSlice from "./docPreviewSlice";
import syncStateSlice from "./syncStateSlice";
import tSubSlice from "./tSubSlice";
import desktopPairingSlice from "../../desktopFrontend/state/desktopPairingSlice";

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
  // Desktop-pairing state lives in desktopFrontend but is registered here so
  // that the single shared Redux store includes it for both platforms.
  // Web components never dispatch to desktopPairing — it is always no-op on web.
  desktopPairing: desktopPairingSlice.reducer,
});

const store = configureStore({ reducer });

export type AppState = ReturnType<typeof reducer>;
export type AppDispatch = typeof store.dispatch;
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector;

export default store;
