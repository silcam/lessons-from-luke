import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppBanner } from "./Banner";
import { original } from "immer";

const bannerSlice = createSlice({
  name: "banners",
  initialState: [] as AppBanner[],
  reducers: {
    add: (_, action: PayloadAction<AppBanner>) => [action.payload],
    reset: () => [],
    removeType: (state, action: PayloadAction<AppBanner["type"]>) =>
      state.filter(banner => banner.type !== action.payload),
    remove: (state, action: PayloadAction<AppBanner>) =>
      state.filter(banner => original(banner) !== action.payload)
  },
  extraReducers: {
    NetworkConnectionLost: () => {
      const banner: AppBanner = {
        type: "Error",
        error: { type: "No Connection" }
      };
      return [banner];
    },
    NetworkConnectionRestored: () => {
      const banner: AppBanner = {
        type: "Success",
        message: "",
        networkConnectionRestored: true
      };
      return [banner];
    }
  }
});

export default bannerSlice;
