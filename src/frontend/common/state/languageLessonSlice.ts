import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader } from "../api/RequestContext";
import { LanguageLesson } from "../../../core/models/LanguageLesson";
import { equal } from "../../../core/models/LanguageLesson";

const languageLessonSlice = createSlice({
  name: "languageLessons",
  initialState: [] as LanguageLesson[],
  reducers: {
    add: (state, action: PayloadAction<LanguageLesson[]>) =>
      modelListMerge(state, action.payload, equal)
  }
});

export default languageLessonSlice;

export function loadLanguageLessons(languageId: number): Loader<void> {
  return get => async dispatch => {
    const languageLessons = await get(
      "/api/languages/:languageId/lessonVersions",
      { languageId }
    );
    if (languageLessons)
      dispatch(languageLessonSlice.actions.add(languageLessons));
  };
}
