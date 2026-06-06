import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppDispatch } from "./appState";
import { User } from "../../../core/models/User";
import { Locale } from "../../../core/i18n/I18n";

interface CurrentUserState {
  user: User | null;
  locale: Locale;
  loaded: boolean;
  error: string | null;
}

const currentUserSlice = createSlice({
  name: "currentUser",
  initialState: {
    user: null,
    locale: "en",
    loaded: false,
    error: null,
  } as CurrentUserState,
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
      state.error = null;
    },
    logout: (state) => {
      state.user = null;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
});

export default currentUserSlice;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const getAuthClient = () => require("../../web/auth/authClient").authClient as typeof import("../../web/auth/authClient").authClient;

export function loadCurrentUser() {
  return async (dispatch: AppDispatch) => {
    const authClient = getAuthClient();
    const result = await authClient.getSession();
    if (result?.data?.user) {
      const { id, admin } = result.data.user as { id: string; admin?: boolean };
      dispatch(currentUserSlice.actions.setUser({ id, admin: Boolean(admin) }));
    } else {
      dispatch(currentUserSlice.actions.setUser(null));
    }
  };
}

export function pushLogin(login: { email: string; password: string }) {
  return async (dispatch: AppDispatch) => {
    const authClient = getAuthClient();
    const result = await authClient.signIn.email({
      email: login.email,
      password: login.password,
      callbackURL: "/",
    });
    if (result.error && result.error.status === 401) {
      dispatch(
        currentUserSlice.actions.setError(
          result.error.message ?? "Invalid credentials"
        )
      );
    } else if (result.data?.user) {
      const { id } = result.data.user as { id: string; admin?: boolean };
      dispatch(currentUserSlice.actions.setUser({ id, admin: true }));
    }
  };
}

export function pushLogout() {
  return async (dispatch: AppDispatch) => {
    const authClient = getAuthClient();
    await authClient.signOut();
    dispatch(currentUserSlice.actions.setUser(null));
  };
}
