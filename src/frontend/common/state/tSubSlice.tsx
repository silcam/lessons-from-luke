import { TSubLite, divideTSubs } from "../../../core/models/TSub";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Loader } from "../api/useLoad";
import tStringSlice from "./tStringSlice";

const tSubSlice = createSlice({
  name: "tSubs",
  initialState: { complete: false, tSubsLite: [] as TSubLite[] },
  reducers: {
    set: (
      _,
      action: PayloadAction<{ complete: boolean; tSubsLite: TSubLite[] }>
    ) => action.payload
  }
});

export default tSubSlice;

export function loadTSubs(): Loader<void> {
  return get => async dispatch => {
    const data = await get("/api/admin/lessons/lessonUpdateIssues", {});
    if (data) {
      const { complete, tSubs } = data;
      const [tSubsLite, tStrings] = divideTSubs(tSubs);
      dispatch(tSubSlice.actions.set({ tSubsLite, complete }));
      dispatch(tStringSlice.actions.add(tStrings));
    }
  };
}
