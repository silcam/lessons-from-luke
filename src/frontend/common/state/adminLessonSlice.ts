import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Lesson, BaseLesson, lessonCompare } from "../../../core/models/Lesson";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader } from "../api/useLoad";


// This is mostly to see if my idea works, otherwise this 
// is a lot of duplication.
const adminLessonSlice = createSlice({
  name: "adminLessons",
  initialState: [] as Array<BaseLesson | Lesson>,
  reducers: {
    add: (state, action: PayloadAction<BaseLesson[]>) =>
      modelListMerge(
        state,
        action.payload,
        (a, b) => a.lessonId == b.lessonId
      ).sort(lessonCompare)
  }
});

export default adminLessonSlice;

export function loadAdminLessons(): Loader<void> {
  return get => async dispatch => {
    const lessons = await get("/api/admin/lessons", {});
    if (lessons) dispatch(adminLessonSlice.actions.add(lessons));
  };
}

// export function loadLesson(lessonId: number): Loader<void> {
//   return get => async dispatch => {
//     const lesson = await get(`/api/lessons/:lessonId`, { lessonId });
//     if (lesson) dispatch(lessonSlice.actions.add([lesson]));
//   };
// }
