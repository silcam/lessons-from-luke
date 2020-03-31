import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Loader } from "../api/RequestContext";

interface DocPreviewState {
  [lessonId: number]: string;
}

const docPreviewSlice = createSlice({
  name: "docPreviews",
  initialState: {} as DocPreviewState,
  reducers: {
    add: (state, action: PayloadAction<DocPreviewState>) => ({
      ...state,
      ...action.payload
    })
  }
});

export function loadDocPreview(lessonId: number): Loader<void> {
  return get => async dispatch => {
    const data = await get("/api/lessons/:lessonId/webified", { lessonId });
    if (data) {
      dispatch(docPreviewSlice.actions.add({ [lessonId]: data.html }));
    }
  };
}

export default docPreviewSlice;
