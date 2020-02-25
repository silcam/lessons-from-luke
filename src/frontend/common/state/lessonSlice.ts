import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Lesson, BaseLesson, lessonCompare } from "../../../core/models/Lesson";
import { modelListMerge } from "../../../core/util/arrayUtils";
import { Loader, Pusher } from "../api/RequestContext";
import { EnglishUploadMeta } from "../../../core/models/DocUploadMeta";
import { postFile } from "../../web/common/WebAPI";
import { TString } from "../../../core/models/TString";
import tStringSlice from "./tStringSlice";
import { DocString } from "../../../core/models/DocString";

const lessonSlice = createSlice({
  name: "lessons",
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

export function pushLesson(
  file: File,
  meta: EnglishUploadMeta
): Pusher<Lesson> {
  return async (_, dispatch) => {
    const data: { lesson: Lesson; tStrings: TString[] } = await postFile(
      "/api/admin/documents",
      "document",
      file,
      meta
    );
    if (data) {
      dispatch(lessonSlice.actions.add([data.lesson]));
      dispatch(tStringSlice.actions.add(data.tStrings));
      return data.lesson;
    }
    return null;
  };
}

export function pushLessonStrings(
  lessonId: number,
  docStrings: DocString[]
): Pusher<Lesson> {
  return async (post, dispatch) => {
    const data = await post(
      "/api/admin/lessons/:lessonId/strings",
      { lessonId },
      docStrings
    );
    if (data) {
      dispatch(lessonSlice.actions.add([data.lesson]));
      dispatch(tStringSlice.actions.add(data.tStrings));
      return data.lesson;
    }
    return null;
  };
}
