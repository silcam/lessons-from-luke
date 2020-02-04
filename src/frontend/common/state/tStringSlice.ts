import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TString, equal } from "../../../core/models/TString";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader, Pusher } from "../api/RequestContext";
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
  lessonVersionId?: number
): Loader<void> {
  return get => async dispatch => {
    const strings = await (lessonVersionId
      ? get(
          "/api/languages/:languageId/lessonVersions/:lessonVersionId/tStrings",
          { languageId, lessonVersionId }
        )
      : get("/api/languages/:languageId/tStrings", { languageId }));
    if (strings) dispatch(tStringSlice.actions.add(strings));
  };
}

export function pushTString(
  tString: TString,
  language: Language
): Pusher<TString> {
  return async (post, dispatch) => {
    const savedTString = await post(
      "/api/tStrings",
      {},
      { ...tString, code: language.code }
    );
    if (savedTString) dispatch(tStringSlice.actions.add([savedTString]));
    return savedTString;
  };
}
