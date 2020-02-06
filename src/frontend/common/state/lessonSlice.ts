import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Lesson } from "../../../core/models/Lesson";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader } from "../api/RequestContext";

const lessonSlice = createSlice({
  name: "lessons",
  initialState: [] as Lesson[],
  reducers: {
    add: (state, action: PayloadAction<Lesson[]>) =>
      modelListMerge(state, action.payload, (a, b) => a.lessonId == b.lessonId)
  }
});

export default lessonSlice;

export function loadLessons(): Loader<void> {
  return get => async dispatch => {
    const lessons = await get("/api/lessons", {});
    if (lessons) dispatch(lessonSlice.actions.add(lessons));
  };
}
