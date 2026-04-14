import loadingSlice from "./loadingSlice";

describe("loadingSlice reducers", () => {
  const initialState = 0;

  describe("addLoading", () => {
    it("increments the loading count from 0 to 1", () => {
      const state = loadingSlice.reducer(
        initialState,
        loadingSlice.actions.addLoading()
      );

      expect(state).toBe(1);
    });

    it("increments multiple times", () => {
      let state = loadingSlice.reducer(
        initialState,
        loadingSlice.actions.addLoading()
      );
      state = loadingSlice.reducer(state, loadingSlice.actions.addLoading());
      state = loadingSlice.reducer(state, loadingSlice.actions.addLoading());

      expect(state).toBe(3);
    });
  });

  describe("subtractLoading", () => {
    it("decrements the loading count", () => {
      const state = loadingSlice.reducer(
        2,
        loadingSlice.actions.subtractLoading()
      );

      expect(state).toBe(1);
    });

    it("decrements to zero", () => {
      const state = loadingSlice.reducer(
        1,
        loadingSlice.actions.subtractLoading()
      );

      expect(state).toBe(0);
    });
  });

  describe("addLoading and subtractLoading together", () => {
    it("correctly tracks concurrent loading operations", () => {
      let state = initialState;
      state = loadingSlice.reducer(state, loadingSlice.actions.addLoading());
      state = loadingSlice.reducer(state, loadingSlice.actions.addLoading());
      state = loadingSlice.reducer(state, loadingSlice.actions.subtractLoading());

      expect(state).toBe(1);

      state = loadingSlice.reducer(state, loadingSlice.actions.subtractLoading());
      expect(state).toBe(0);
    });
  });

  describe("initial state", () => {
    it("starts at 0", () => {
      const state = loadingSlice.reducer(undefined, { type: "@@INIT" });
      expect(state).toBe(0);
    });
  });
});
