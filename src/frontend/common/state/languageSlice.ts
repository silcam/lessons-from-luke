import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  MaybePublicLanguage,
  Language,
  languageCompare,
  NewLanguage
} from "../../../core/models/Language";
import { GetRequest } from "../api/RequestContext";
import { AppDispatch } from "./appState";
import tStringSlice from "./tStringSlice";
import { TString } from "../../../core/models/TString";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { localeByLanguageId } from "../../../core/i18n/I18n";
import currentUserSlice from "./currentUserSlice";
import { Pusher } from "../api/useLoad";

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
      state.adminLanguages = modelListMerge(
        state.adminLanguages,
        [action.payload],
        (a, b) => a.languageId == b.languageId,
        languageCompare
      );
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
    },
    setProgress: (
      state,
      action: PayloadAction<{
        languageId: number;
        lessonId: number;
        progress: number;
      }>
    ) => {
      const { languageId, lessonId, progress } = action.payload;
      if (state.translating?.languageId !== languageId) {
        console.error(
          `Can't update progress for language ${languageId} - translating language is ${state.translating?.languageId}`
        );
        return;
      }
      state.translating.progress = state.translating.progress.filter(
        pr => pr.lessonId != lessonId
      );
      state.translating.progress.push({ lessonId, progress });
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
    if (language) {
      dispatch(languageSlice.actions.setTranslating(language));
      dispatch(
        currentUserSlice.actions.setLocaleIfNoUser(
          localeByLanguageId(language.defaultSrcLang)
        )
      );
    }
  };
}

export function pushLanguage(newLanguage: NewLanguage): Pusher<Language> {
  return async (post, dispatch) => {
    const language = await post("/api/admin/languages", {}, newLanguage);
    if (language) dispatch(languageSlice.actions.addLanguage(language));
    return language;
  };
}

export function pushLanguageUpdate(language: Language): Pusher<Language> {
  return async (post, dispatch) => {
    const updatedLanguage = await post(
      "/api/admin/languages/:languageId",
      { languageId: language.languageId },
      { motherTongue: language.motherTongue, defaultSrcLang: language.defaultSrcLang }
    );
    if (updatedLanguage)
      dispatch(languageSlice.actions.addLanguage(updatedLanguage));
    return updatedLanguage;
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
