/// <reference types="jest" />

import { ON_SYNC_STATE_CHANGE, ON_ERROR } from "./IpcChannels";

describe("IpcChannels", () => {
  test("ON_SYNC_STATE_CHANGE equals 'onSyncStateChange'", () => {
    expect(ON_SYNC_STATE_CHANGE).toBe("onSyncStateChange");
  });

  test("ON_ERROR equals 'onError'", () => {
    expect(ON_ERROR).toBe("onError");
  });
});
