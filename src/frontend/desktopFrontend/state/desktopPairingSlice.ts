import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface DesktopPairingState {
  paired: boolean;
  pairedUserName?: string;
}

/**
 * Desktop-only Redux slice that tracks the device-pairing state (RFC 8628).
 * These fields are intentionally excluded from the isomorphic `SyncState`
 * domain model — they belong only to the Electron desktop layer.
 */
const desktopPairingSlice = createSlice({
  name: "desktopPairing",
  initialState: {
    paired: false,
    pairedUserName: undefined,
  } as DesktopPairingState,
  reducers: {
    setPaired: (state, action: PayloadAction<boolean>) => {
      state.paired = action.payload;
      if (!action.payload) {
        state.pairedUserName = undefined;
      }
    },
    setPairedUser: (state, action: PayloadAction<string | undefined>) => {
      state.pairedUserName = action.payload;
    },
  },
});

export default desktopPairingSlice;
