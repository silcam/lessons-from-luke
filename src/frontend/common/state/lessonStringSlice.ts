import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { LessonString } from "../../../core/models/LessonString";
import { Loader } from "../api/RequestContext";
import { GetRoute } from "../../../core/interfaces/Api";
import { modelListMerge } from "../../../core/util/arrayUtils";

const lessonStringSlice = createSlice({
  name: "languageStrings",
  initialState: [] as LessonString[],
  reducers: {
    add: (state, action: PayloadAction<LessonString[]>) =>
      modelListMerge(
        state,
        action.payload,
        (a, b) => a.lessonStringId == b.lessonStringId
      )
  }
});

export default lessonStringSlice;

export function loadLessonStrings(
  param: { lessonVersionId: number } | { languageId: number }
): Loader<void> {
  return get => async dispatch => {
    const route: GetRoute =
      "languageId" in param
        ? "/api/languages/:languageId/lessonStrings"
        : "/api/lessonVersions/:lessonVersionId/lessonStrings";
    const strings = await get(route, param);
    if (strings) dispatch(lessonStringSlice.actions.add(strings));
  };
}
