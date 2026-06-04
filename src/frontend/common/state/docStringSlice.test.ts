import docStringSlice from "./docStringSlice";
import { DocString } from "../../../core/models/DocString";

function makeDocString(overrides: Partial<DocString> = {}): DocString {
  return {
    type: "content",
    xpath: "/root/p[1]",
    motherTongue: false,
    text: "Hello",
    ...overrides
  };
}

describe("docStringSlice reducers", () => {
  const initialState = {};

  describe("add", () => {
    it("adds docStrings for a language+lesson to empty state", () => {
      const docStrings = [makeDocString({ text: "Hello" })];

      const state = docStringSlice.reducer(
        initialState,
        docStringSlice.actions.add({ languageId: 1, lessonId: 10, docStrings })
      );

      expect(state[1]).toBeDefined();
      expect(state[1][10]).toEqual(docStrings);
    });

    it("adds a new lessonId under an existing languageId", () => {
      const ds1 = [makeDocString({ text: "Lesson 10" })];
      const ds2 = [makeDocString({ text: "Lesson 11" })];

      const stateWith10 = docStringSlice.reducer(
        initialState,
        docStringSlice.actions.add({ languageId: 1, lessonId: 10, docStrings: ds1 })
      );

      const state = docStringSlice.reducer(
        stateWith10,
        docStringSlice.actions.add({ languageId: 1, lessonId: 11, docStrings: ds2 })
      );

      expect(state[1][10]).toEqual(ds1);
      expect(state[1][11]).toEqual(ds2);
    });

    it("adds a new languageId without disturbing existing ones", () => {
      const ds1 = [makeDocString({ text: "Lang 1" })];
      const ds2 = [makeDocString({ text: "Lang 2" })];

      const stateWithLang1 = docStringSlice.reducer(
        initialState,
        docStringSlice.actions.add({ languageId: 1, lessonId: 10, docStrings: ds1 })
      );

      const state = docStringSlice.reducer(
        stateWithLang1,
        docStringSlice.actions.add({ languageId: 2, lessonId: 10, docStrings: ds2 })
      );

      expect(state[1][10]).toEqual(ds1);
      expect(state[2][10]).toEqual(ds2);
    });

    it("replaces docStrings for the same languageId+lessonId", () => {
      const oldStrings = [makeDocString({ text: "Old" })];
      const newStrings = [makeDocString({ text: "New" }), makeDocString({ text: "New 2" })];

      const stateWithOld = docStringSlice.reducer(
        initialState,
        docStringSlice.actions.add({ languageId: 1, lessonId: 10, docStrings: oldStrings })
      );

      const state = docStringSlice.reducer(
        stateWithOld,
        docStringSlice.actions.add({ languageId: 1, lessonId: 10, docStrings: newStrings })
      );

      expect(state[1][10]).toEqual(newStrings);
      expect(state[1][10]).toHaveLength(2);
    });

    it("stores an empty array of docStrings", () => {
      const state = docStringSlice.reducer(
        initialState,
        docStringSlice.actions.add({ languageId: 1, lessonId: 10, docStrings: [] })
      );

      expect(state[1][10]).toEqual([]);
    });
  });
});
