import lessonSlice, { loadLessons, loadLesson } from "./lessonSlice";
import { BaseLesson, Lesson } from "../../../core/models/Lesson";

function makeBaseLesson(overrides: Partial<BaseLesson> = {}): BaseLesson {
  return {
    lessonId: 1,
    book: "Luke",
    series: 1,
    lesson: 1,
    version: 1,
    ...overrides
  };
}

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    ...makeBaseLesson(overrides),
    lessonStrings: [],
    ...overrides
  };
}

describe("lessonSlice reducers", () => {
  const initialState: Array<BaseLesson | Lesson> = [];

  describe("add", () => {
    it("adds a lesson to empty state", () => {
      const lesson = makeBaseLesson({ lessonId: 1 });

      const state = lessonSlice.reducer(
        initialState,
        lessonSlice.actions.add([lesson])
      );

      expect(state).toHaveLength(1);
      expect(state[0]).toEqual(lesson);
    });

    it("merges lessons without duplicating by lessonId", () => {
      const lesson1 = makeBaseLesson({ lessonId: 1, series: 1, lesson: 1 });
      const stateWithLesson = lessonSlice.reducer(
        initialState,
        lessonSlice.actions.add([lesson1])
      );

      const updatedLesson1 = makeBaseLesson({ lessonId: 1, series: 1, lesson: 1, version: 2 });
      const lesson2 = makeBaseLesson({ lessonId: 2, series: 1, lesson: 2 });

      const state = lessonSlice.reducer(
        stateWithLesson,
        lessonSlice.actions.add([updatedLesson1, lesson2])
      );

      expect(state).toHaveLength(2);
      expect(state.find(l => l.lessonId === 1)!.version).toBe(2);
    });

    it("sorts lessons by lessonCompare (book, series, lesson)", () => {
      const acts = makeBaseLesson({ lessonId: 3, book: "Acts", series: 1, lesson: 1 });
      const luke12 = makeBaseLesson({ lessonId: 2, book: "Luke", series: 1, lesson: 2 });
      const luke11 = makeBaseLesson({ lessonId: 1, book: "Luke", series: 1, lesson: 1 });

      const state = lessonSlice.reducer(
        initialState,
        lessonSlice.actions.add([acts, luke12, luke11])
      );

      expect(state.map(l => l.lessonId)).toEqual([1, 2, 3]);
    });

    it("adds multiple lessons at once", () => {
      const lessons = [
        makeBaseLesson({ lessonId: 1, series: 1, lesson: 1 }),
        makeBaseLesson({ lessonId: 2, series: 1, lesson: 2 }),
        makeBaseLesson({ lessonId: 3, series: 1, lesson: 3 })
      ];

      const state = lessonSlice.reducer(
        initialState,
        lessonSlice.actions.add(lessons)
      );

      expect(state).toHaveLength(3);
    });
  });
});

describe("lessonSlice thunks", () => {
  describe("loadLessons", () => {
    it("calls GET /api/lessons and dispatches add", async () => {
      const lessons = [makeBaseLesson({ lessonId: 1 })];
      const get = jest.fn().mockResolvedValue(lessons);
      const dispatch = jest.fn();

      await loadLessons()(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/lessons", {});
      expect(dispatch).toHaveBeenCalledWith(lessonSlice.actions.add(lessons));
    });

    it("does not dispatch if GET returns null", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await loadLessons()(get)(dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe("loadLesson", () => {
    it("calls GET /api/lessons/:lessonId and dispatches add", async () => {
      const lesson = makeLesson({ lessonId: 42 });
      const get = jest.fn().mockResolvedValue(lesson);
      const dispatch = jest.fn();

      await loadLesson(42)(get)(dispatch);

      expect(get).toHaveBeenCalledWith("/api/lessons/:lessonId", { lessonId: 42 });
      expect(dispatch).toHaveBeenCalledWith(lessonSlice.actions.add([lesson]));
    });

    it("does not dispatch if GET returns null", async () => {
      const get = jest.fn().mockResolvedValue(null);
      const dispatch = jest.fn();

      await loadLesson(42)(get)(dispatch);

      expect(dispatch).not.toHaveBeenCalled();
    });
  });
});
