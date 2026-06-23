import { createSlice, PayloadAction } from "@reduxjs/toolkit";
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
      state.error = null;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
    },
  },
});

export default currentUserSlice;
