import { configureStore, combineReducers } from "@reduxjs/toolkit";
import languageSlice from "./languageSlice";
import currentUserSlice from "./currentUserSlice";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "../api/loadingSlice";
import { TypedUseSelectorHook, useSelector } from "react-redux";
import languageLessonSlice from "./languageLessonSlice";
import lessonStringSlice from "./lessonStringSlice";
import tStringSlice from "./tStringSlice";
import lessonSlice from "./lessonSlice";

const reducer = combineReducers({
  languages: languageSlice.reducer,
  languageLessons: languageLessonSlice.reducer,
  lessonStrings: lessonStringSlice.reducer,
  tStrings: tStringSlice.reducer,
  currentUser: currentUserSlice.reducer,
  banners: bannerSlice.reducer,
  loading: loadingSlice.reducer,
  lessons: lessonSlice.reducer
});

const store = configureStore({ reducer });

export type AppState = ReturnType<typeof reducer>;
export type AppDispatch = typeof store.dispatch;
export const useAppSelector: TypedUseSelectorHook<AppState> = useSelector;

export default store;
