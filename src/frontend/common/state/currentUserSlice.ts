import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppDispatch } from "./appState";
import { User, LoginAttempt } from "../../../core/models/User";
import { GetRequest, Pusher } from "../api/RequestContext";
import { Locale } from "../../../core/i18n/I18n";

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
    setLocaleIfNoUser: (state, action: PayloadAction<Locale>) => {
      if (!state.user) state.locale = action.payload;
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

export function pushLogin(login: LoginAttempt): Pusher<void> {
  return async (post, dispatch) => {
    const user = await post("/api/users/login", {}, login);
    dispatch(currentUserSlice.actions.setUser(user));
  };
}

export function pushLogout(): Pusher<void> {
  return async (post, dispatch) => {
    await post("/api/users/logout", {}, null);
    dispatch(currentUserSlice.actions.logout());
  };
}
