import docPreviewSlice, { loadDocPreview } from "./docPreviewSlice";

describe("docPreviewSlice reducers", () => {
  const initialState = {};

  describe("add", () => {
    it("adds a preview to empty state", () => {
      const state = docPreviewSlice.reducer(
        initialState,
        docPreviewSlice.actions.add({ 1: "<html>lesson 1</html>" })
      );

      expect(state[1]).toBe("<html>lesson 1</html>");
    });

    it("merges previews without overwriting unrelated keys", () => {
      const stateWith1 = docPreviewSlice.reducer(
        initialState,
        docPreviewSlice.actions.add({ 1: "<html>lesson 1</html>" })
      );

      const state = docPreviewSlice.reducer(
        stateWith1,
        docPreviewSlice.actions.add({ 2: "<html>lesson 2</html>" })
      );

      expect(state[1]).toBe("<html>lesson 1</html>");
      expect(state[2]).toBe("<html>lesson 2</html>");
    });

    it("overwrites an existing preview for the same lessonId", () => {
      const stateWith1 = docPreviewSlice.reducer(
        initialState,
        docPreviewSlice.actions.add({ 1: "<html>old</html>" })
      );

      const state = docPreviewSlice.reducer(
        stateWith1,
        docPreviewSlice.actions.add({ 1: "<html>new</html>" })
      );

      expect(state[1]).toBe("<html>new</html>");
    });

    it("can add multiple previews at once", () => {
      const state = docPreviewSlice.reducer(
        initialState,
        docPreviewSlice.actions.add({ 1: "<html>a</html>", 2: "<html>b</html>" })
      );

      expect(state[1]).toBe("<html>a</html>");
      expect(state[2]).toBe("<html>b</html>");
    });
  });
});

describe("loadDocPreview thunk", () => {
  it("calls GET /api/lessons/:lessonId/webified and dispatches add with html", async () => {
    const get = jest.fn().mockResolvedValue({ html: "<html>preview</html>" });
    const dispatch = jest.fn();

    await loadDocPreview(42)(get)(dispatch);

    expect(get).toHaveBeenCalledWith(
      "/api/lessons/:lessonId/webified",
      { lessonId: 42 }
    );
    expect(dispatch).toHaveBeenCalledWith(
      docPreviewSlice.actions.add({ 42: "<html>preview</html>" })
    );
  });

  it("does not dispatch if GET returns null", async () => {
    const get = jest.fn().mockResolvedValue(null);
    const dispatch = jest.fn();

    await loadDocPreview(42)(get)(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not dispatch if GET returns undefined", async () => {
    const get = jest.fn().mockResolvedValue(undefined);
    const dispatch = jest.fn();

    await loadDocPreview(5)(get)(dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
