import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TString, equal } from "../../../core/models/TString";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader, Pusher } from "../api/useLoad";
import { Language } from "../../../core/models/Language";

const tStringSlice = createSlice({
  name: "tStrings",
  initialState: [] as TString[],
  reducers: {
    add: (state, action: PayloadAction<TString[]>) =>
      modelListMerge(state, action.payload, equal)
  }
});

export default tStringSlice;

export function loadTStrings(
  languageId: number,
  lessonId?: number
): Loader<void> {
  return get => async dispatch => {
    const strings = await (lessonId
      ? get("/api/languages/:languageId/lessons/:lessonId/tStrings", {
          languageId,
          lessonId
        })
      : get("/api/languages/:languageId/tStrings", { languageId }));
    if (strings) dispatch(tStringSlice.actions.add(strings));
  };
}

export function pushTStrings(
  tStrings: TString[],
  language: Language
): Pusher<TString[]> {
  return async (post, dispatch) => {
    const savedTStrings = await post(
      "/api/tStrings",
      {},
      { tStrings, code: language.code }
    );
    if (savedTStrings) dispatch(tStringSlice.actions.add(savedTStrings));
    return savedTStrings;
  };
}
