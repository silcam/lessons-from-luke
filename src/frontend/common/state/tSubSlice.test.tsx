import tSubSlice, { loadTSubs } from "./tSubSlice";
import tStringSlice from "./tStringSlice";
import { TSubLite, TSub } from "../../../core/models/TSub";
import { TString } from "../../../core/models/TString";

function makeTString(overrides: Partial<TString> = {}): TString {
  return {
    masterId: 1,
    languageId: 1,
    text: "Hello",
    history: [],
    ...overrides
  };
}

function makeTSubLite(overrides: Partial<TSubLite> = {}): TSubLite {
  return {
    languageId: 1,
    from: [1, 2],
    to: [3, 4],
    ...overrides
  };
}

describe("tSubSlice reducers", () => {
  const initialState = {};

  describe("set", () => {
    it("sets tSubsLite for a lessonId in empty state", () => {
      const tSubsLite = [makeTSubLite({ languageId: 1, from: [1], to: [2] })];

      const state = tSubSlice.reducer(
        initialState,
        tSubSlice.actions.set({ lessonId: 10, tSubsLite })
      );

      expect(state[10]).toEqual(tSubsLite);
    });

    it("replaces existing tSubsLite for the same lessonId", () => {
      const old = [makeTSubLite({ from: [1], to: [2] })];
      const updated = [makeTSubLite({ from: [3], to: [4] })];

      const stateWithOld = tSubSlice.reducer(
        initialState,
        tSubSlice.actions.set({ lessonId: 10, tSubsLite: old })
      );

      const state = tSubSlice.reducer(
        stateWithOld,
        tSubSlice.actions.set({ lessonId: 10, tSubsLite: updated })
      );

      expect(state[10]).toEqual(updated);
    });

    it("sets tSubsLite for multiple lessonIds independently", () => {
      const tsubs10 = [makeTSubLite({ from: [1], to: [2] })];
      const tsubs11 = [makeTSubLite({ languageId: 2, from: [5], to: [6] })];

      const stateWith10 = tSubSlice.reducer(
        initialState,
        tSubSlice.actions.set({ lessonId: 10, tSubsLite: tsubs10 })
      );

      const state = tSubSlice.reducer(
        stateWith10,
        tSubSlice.actions.set({ lessonId: 11, tSubsLite: tsubs11 })
      );

      expect(state[10]).toEqual(tsubs10);
      expect(state[11]).toEqual(tsubs11);
    });

    it("sets an empty array for a lessonId", () => {
      const state = tSubSlice.reducer(
        initialState,
        tSubSlice.actions.set({ lessonId: 10, tSubsLite: [] })
      );

      expect(state[10]).toEqual([]);
    });
  });
});

describe("loadTSubs thunk", () => {
  it("calls GET /api/admin/lessons/:lessonId/lessonUpdateIssues and dispatches set and add", async () => {
    // divideTSubs processes TSub[] — provide minimal TSub objects
    const tStr1 = makeTString({ masterId: 1, languageId: 1 });
    const tStr2 = makeTString({ masterId: 2, languageId: 1 });
    const tSubs: TSub[] = [
      {
        languageId: 1,
        engFrom: [tStr1],
        engTo: [tStr2],
        from: [],
        to: []
      }
    ];

    const get = jest.fn().mockResolvedValue(tSubs);
    const dispatch = jest.fn();

    await loadTSubs(42)(get)(dispatch);

    expect(get).toHaveBeenCalledWith(
      "/api/admin/lessons/:lessonId/lessonUpdateIssues",
      { lessonId: 42 }
    );

    // Should have dispatched tSubSlice.actions.set and tStringSlice.actions.add
    expect(dispatch).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = dispatch.mock.calls;
    expect(firstCall[0].type).toBe("tSubs/set");
    expect(firstCall[0].payload.lessonId).toBe(42);
    expect(secondCall[0].type).toBe("tStrings/add");
  });

  it("dispatches set with divideTSubs result (from maps engFrom, to maps engTo)", async () => {
    const tStr1 = makeTString({ masterId: 10, languageId: 1 });
    const tStr2 = makeTString({ masterId: 20, languageId: 1 });
    const tSubs: TSub[] = [
      {
        languageId: 1,
        engFrom: [tStr1],
        engTo: [tStr2],
        from: [],
        to: []
      }
    ];

    const get = jest.fn().mockResolvedValue(tSubs);
    const dispatch = jest.fn();

    await loadTSubs(42)(get)(dispatch);

    const setCall = dispatch.mock.calls[0][0];
    expect(setCall.payload.tSubsLite[0].from).toEqual([10]);
    expect(setCall.payload.tSubsLite[0].to).toEqual([20]);
  });

  it("does not dispatch if GET returns null", async () => {
    const get = jest.fn().mockResolvedValue(null);
    const dispatch = jest.fn();

    await loadTSubs(42)(get)(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch if GET returns undefined", async () => {
    const get = jest.fn().mockResolvedValue(undefined);
    const dispatch = jest.fn();

    await loadTSubs(10)(get)(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
