import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Lesson, BaseLesson } from "../../../core/models/Lesson";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader } from "../api/RequestContext";

const lessonSlice = createSlice({
  name: "lessons",
  initialState: [] as Array<BaseLesson | Lesson>,
  reducers: {
    add: (state, action: PayloadAction<BaseLesson[]>) =>
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

export function loadLesson(lessonId: number): Loader<void> {
  return get => async dispatch => {
    const lesson = await get(`/api/lessons/:lessonId`, { lessonId });
    if (lesson) dispatch(lessonSlice.actions.add([lesson]));
  };
}
