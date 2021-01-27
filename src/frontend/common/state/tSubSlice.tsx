import { TSubLite, divideTSubs } from "../../../core/models/TSub";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Loader } from "../api/useLoad";
import tStringSlice from "./tStringSlice";

const tSubSlice = createSlice({
  name: "tSubs",
  initialState: {} as { [lessonId: number]: TSubLite[] },
  reducers: {
    set: (
      state,
      action: PayloadAction<{ lessonId: number; tSubsLite: TSubLite[] }>
    ) => {
      state[action.payload.lessonId] = action.payload.tSubsLite;
    }
  }
});

export default tSubSlice;

export function loadTSubs(lessonId: number): Loader<void> {
  return get => async dispatch => {
    const tSubs = await get("/api/admin/lessons/:lessonId/lessonUpdateIssues", {
      lessonId
    });
    if (tSubs) {
      const [tSubsLite, tStrings] = divideTSubs(tSubs);
      dispatch(tSubSlice.actions.set({ tSubsLite, lessonId }));
      dispatch(tStringSlice.actions.add(tStrings));
    }
  };
}
