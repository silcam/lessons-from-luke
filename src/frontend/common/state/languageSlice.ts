import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  MaybePublicLanguage,
  Language,
  languageCompare
} from "../../../core/models/Language";
import { GetRequest } from "../../api/RequestContext";
import { AppDispatch } from "./appState";

interface State {
  languages: MaybePublicLanguage[];
  translating?: Language;
}

const languageSlice = createSlice({
  name: "languages",
  initialState: { languages: [] } as State,
  reducers: {
    setLanguages: (state, action: PayloadAction<MaybePublicLanguage[]>) => {
      state.languages = action.payload.sort(languageCompare);
    },
    addLanguage: (state, action: PayloadAction<MaybePublicLanguage>) => {
      state.languages.push(action.payload);
      state.languages.sort(languageCompare);
    },
    setTranslating: (state, action: PayloadAction<Language>) => {
      state.translating = action.payload;
    }
  }
});

export default languageSlice;

export function loadLanguages() {
  return (get: GetRequest) => async (dispath: AppDispatch) => {
    const languages = await get("/api/languages", {});
    if (languages) dispath(languageSlice.actions.setLanguages(languages));
  };
}

export function loadTranslatingLanguage(code: string) {
  return (get: GetRequest) => async (dispatch: AppDispatch) => {
    const language = await get("/api/languages/code/:code", { code });
    if (language) dispatch(languageSlice.actions.setTranslating(language));
  };
}
