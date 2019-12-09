import { configureStore, combineReducers } from "@reduxjs/toolkit";
import languageSlice from "./languageSlice";
import currentUserSlice from "./currentUserSlice";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "../../api/loadingSlice";

const reducer = combineReducers({
  languages: languageSlice.reducer,
  currentUser: currentUserSlice.reducer,
  banners: bannerSlice.reducer,
  loading: loadingSlice.reducer
});

const store = configureStore({ reducer });

export type AppState = ReturnType<typeof reducer>;
export type AppDispatch = typeof store.dispatch;

export default store;
