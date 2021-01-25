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
  syncState: syncStateSlice.reducer
});

const store = configureStore({ reducer });

export type AppState = ReturnType<typeof reducer>;
export type AppDispatch = typeof store.dispatch;
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector;

export default store;
