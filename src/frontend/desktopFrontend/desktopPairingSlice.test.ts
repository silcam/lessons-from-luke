import desktopPairingSlice from "./desktopPairingSlice";

function makeInitialState() {
  return { paired: false, pairedUserName: undefined as string | undefined };
}

describe("desktopPairingSlice reducers", () => {
  describe("setPaired", () => {
    it("sets paired to true", () => {
      const initial = makeInitialState();
      const state = desktopPairingSlice.reducer(
        initial,
        desktopPairingSlice.actions.setPaired(true)
      );
      expect(state.paired).toBe(true);
    });

    it("sets paired to false", () => {
      const initial = { ...makeInitialState(), paired: true, pairedUserName: "John" };
      const state = desktopPairingSlice.reducer(
        initial,
        desktopPairingSlice.actions.setPaired(false)
      );
      expect(state.paired).toBe(false);
    });

    it("clears pairedUserName when setting paired to false", () => {
      const initial = { ...makeInitialState(), paired: true, pairedUserName: "John" };
      const state = desktopPairingSlice.reducer(
        initial,
        desktopPairingSlice.actions.setPaired(false)
      );
      expect(state.pairedUserName).toBeUndefined();
    });

    it("preserves pairedUserName when setting paired to true", () => {
      const initial = { ...makeInitialState(), pairedUserName: "John" };
      const state = desktopPairingSlice.reducer(
        initial,
        desktopPairingSlice.actions.setPaired(true)
      );
      expect(state.pairedUserName).toBe("John");
    });
  });

  describe("setPairedUser", () => {
    it("sets pairedUserName to a string", () => {
      const initial = makeInitialState();
      const state = desktopPairingSlice.reducer(
        initial,
        desktopPairingSlice.actions.setPairedUser("John")
      );
      expect(state.pairedUserName).toBe("John");
    });

    it("clears pairedUserName when called with undefined", () => {
      const initial = { ...makeInitialState(), pairedUserName: "John" };
      const state = desktopPairingSlice.reducer(
        initial,
        desktopPairingSlice.actions.setPairedUser(undefined)
      );
      expect(state.pairedUserName).toBeUndefined();
    });
  });

  describe("initial state", () => {
    it("starts unpaired", () => {
      const state = desktopPairingSlice.reducer(undefined, { type: "@@INIT" });
      expect(state.paired).toBe(false);
    });

    it("starts with no pairedUserName", () => {
      const state = desktopPairingSlice.reducer(undefined, { type: "@@INIT" });
      expect(state.pairedUserName).toBeUndefined();
    });
  });
});
