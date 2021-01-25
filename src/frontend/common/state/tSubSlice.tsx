import { TSubLite, divideTSubs } from "../../../core/models/TSub";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Loader } from "../api/useLoad";
import tStringSlice from "./tStringSlice";

const tSubSlice = createSlice({
  name: "tSubs",
  initialState: [] as TSubLite[],
  reducers: {
    set: (_, action: PayloadAction<TSubLite[]>) => action.payload
  }
});

export default tSubSlice;

export function loadTSubs(): Loader<void> {
  return get => async dispatch => {
    const tSubs = await get("/api/admin/lessons/lessonUpdateIssues", {});
    if (tSubs) {
      const [tSubsLite, tStrings] = divideTSubs(tSubs);
      dispatch(tSubSlice.actions.set(tSubsLite));
      dispatch(tStringSlice.actions.add(tStrings));
    }
  };
}
