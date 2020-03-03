import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  MaybePublicLanguage,
  Language,
  languageCompare
} from "../../../core/models/Language";
import { GetRequest, Pusher } from "../api/RequestContext";
import { AppDispatch } from "./appState";
import tStringSlice from "./tStringSlice";
import { TString } from "../../../core/models/TString";

interface State {
  languages: MaybePublicLanguage[];
  adminLanguages: Language[];
  usfmImportResult?: {
    language: Language;
    errors: string[];
    tStrings: TString[];
  };
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
    },
    setUsfmImportResult: (
      state,
      action: PayloadAction<{
        language: Language;
        tStrings: TString[];
        errors: string[];
      }>
    ) => {
      state.usfmImportResult = action.payload;
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

export function pushUsfm(
  languageId: number,
  usfm: string
): Pusher<{ errors: string[] }> {
  return async (post, dispatch) => {
    const data = await post(
      "/api/admin/languages/:languageId/usfm",
      { languageId },
      { usfm }
    );
    if (data) {
      dispatch(languageSlice.actions.addLanguage(data.language));
      dispatch(languageSlice.actions.setUsfmImportResult(data));
      dispatch(tStringSlice.actions.add(data.tStrings));
      return data;
    }
    return null;
  };
}
