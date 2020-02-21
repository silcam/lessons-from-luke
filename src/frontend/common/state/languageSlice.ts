import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  MaybePublicLanguage,
  Language,
  languageCompare
} from "../../../core/models/Language";
import { GetRequest, Pusher } from "../api/RequestContext";
import { AppDispatch } from "./appState";

interface State {
  languages: MaybePublicLanguage[];
  adminLanguages: Language[];
  translating?: Language;
}

const languageSlice = createSlice({
  name: "languages",
  initialState: { languages: [], adminLanguages: [] } as State,
  reducers: {
    setLanguages: (state, action: PayloadAction<MaybePublicLanguage[]>) => {
      state.languages = action.payload.sort(languageCompare);
    },
    setAdminLanguages: (state, action: PayloadAction<Language[]>) => {
      state.adminLanguages = action.payload.sort(languageCompare);
    },
    addLanguage: (state, action: PayloadAction<Language>) => {
      state.adminLanguages.push(action.payload);
      state.adminLanguages.sort(languageCompare);
    },
    setTranslating: (state, action: PayloadAction<Language>) => {
      state.translating = action.payload;
    }
  }
});

export default languageSlice;

export function loadLanguages(admin: boolean) {
  return (get: GetRequest) => async (dispatch: AppDispatch) => {
    if (admin) {
      const languages = await get("/api/admin/languages", {});
      if (languages)
        dispatch(languageSlice.actions.setAdminLanguages(languages));
    } else {
      const languages = await get("/api/languages", {});
      if (languages) dispatch(languageSlice.actions.setLanguages(languages));
    }
  };
}

export function loadTranslatingLanguage(code: string) {
  return (get: GetRequest) => async (dispatch: AppDispatch) => {
    const language = await get("/api/languages/code/:code", { code });
    if (language) dispatch(languageSlice.actions.setTranslating(language));
  };
}

export function pushLanguage(name: string): Pusher<Language> {
  return async (post, dispatch) => {
    const language = await post("/api/admin/languages", {}, { name });
    if (language) dispatch(languageSlice.actions.addLanguage(language));
    return language;
  };
}
