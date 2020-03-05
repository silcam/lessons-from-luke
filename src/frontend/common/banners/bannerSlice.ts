import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppBanner } from "./Banner";
import { original } from "immer";

const bannerSlice = createSlice({
  name: "banners",
  initialState: [] as AppBanner[],
  reducers: {
    // add: (state, action: PayloadAction<AppBanner>) => {
    //   state.push(action.payload);
    // },
    // FOR THE MOMENT, LET's LIMIT IT TO ONE BANNER
    add: (_, action: PayloadAction<AppBanner>) => [action.payload],
    reset: () => [],
    // remove: (state, action: PayloadAction<[string, any][]>) =>
    //   state.filter(banner =>
    //     action.payload.some(
    //       filter => banner[filter[0] as keyof AppBanner] !== filter[1]
    //     )
    //   )
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
