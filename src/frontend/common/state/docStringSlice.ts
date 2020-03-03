import { DocString } from "../../../core/models/DocString";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface DocStringState {
  [languageId: number]: {
    [lessonId: number]: DocString[];
  };
}

const docStringSlice = createSlice({
  name: "docStrings",
  initialState: {} as DocStringState,
  reducers: {
    add: (
      state,
      action: PayloadAction<{
        languageId: number;
        lessonId: number;
        docStrings: DocString[];
      }>
    ) => {
      const { languageId, lessonId, docStrings } = action.payload;
      if (!state[languageId]) state[languageId] = {};
      state[languageId][lessonId] = docStrings;
    }
  }
});

export default docStringSlice;
