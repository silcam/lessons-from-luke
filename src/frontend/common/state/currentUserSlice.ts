import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import en, { I18nStrings, I18nKey } from "../../locales/en";
import fr from "../../locales/fr";
import { useSelector } from "react-redux";
import { AppState, AppDispatch } from "./appState";
import { User, LoginAttempt } from "../../../core/models/User";
import { GetRequest, PostRequest } from "../../api/RequestContext";

interface CurrentUserState {
  user: User | null;
  locale: Locale;
  loaded: boolean;
}

const currentUserSlice = createSlice({
  name: "currentUser",
  initialState: { user: null, locale: "en", loaded: false } as CurrentUserState,
  reducers: {
    setLocale: (state, action: PayloadAction<Locale>) => {
      state.locale = action.payload;
    },
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.loaded = true;
    },
    logout: state => {
      state.user = null;
    }
  }
});

export default currentUserSlice;

export function loadCurrentUser(get: GetRequest) {
  return async (dispatch: AppDispatch) => {
    const user = await get("/api/users/current", {});
    // Dispatch even if null to set "loaded"
    dispatch(currentUserSlice.actions.setUser(user));
  };
}

export function pushLogin(post: PostRequest, login: LoginAttempt) {
  return async (dispatch: AppDispatch) => {
    const user = await post("/api/users/login", {}, login);
    dispatch(currentUserSlice.actions.setUser(user));
  };
}

export function pushLogout(post: PostRequest) {
  return async (dispatch: AppDispatch) => {
    await post("/api/users/logout", {}, null);
    dispatch(currentUserSlice.actions.logout());
  };
}

const strings = {
  en,
  fr
};
export type Locale = keyof typeof strings;

export type TFunc = (key: I18nKey, subs?: { [key: string]: string }) => string;

export function availableLocales(): Locale[] {
  return Object.keys(strings) as Locale[];
}

function translate(
  strings: I18nStrings,
  key: keyof I18nStrings,
  subs: { [key: string]: string } = {}
) {
  return Object.keys(subs).reduce((outStr, subKey) => {
    const keyPattern = `%{${subKey}}`;
    while (outStr.includes(keyPattern)) {
      outStr = outStr.replace(keyPattern, subs[subKey]);
    }
    return outStr;
  }, strings[key]);
}

function tForLocale(locale: keyof typeof strings): TFunc {
  return (key, subs) => translate(strings[locale], key, subs);
}

export function useTranslation() {
  const locale = useSelector((state: AppState) => state.currentUser.locale);
  return tForLocale(locale);
}
