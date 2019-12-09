import { createSlice } from "@reduxjs/toolkit";

const loadingSlice = createSlice({
  name: "loading",
  initialState: 0,
  reducers: {
    addLoading: state => state + 1,
    subtractLoading: state => state - 1
  }
});

export default loadingSlice;
