import lessonSlice, {
  loadLessons,
  loadLesson,
  pushDocument,
  pushLessonStrings
} from "./lessonSlice";
import { BaseLesson, Lesson } from "../../../core/models/Lesson";
import { TString } from "../../../core/models/TString";
import { DocString } from "../../../core/models/DocString";
import tStringSlice from "./tStringSlice";
import docStringSlice from "./docStringSlice";
import * as WebAPIClient from "../../../core/api/WebAPIClient";

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

jest.mock("../../../core/api/WebAPIClient", () => ({
  postFile: jest.fn()
}));

function makeTString(overrides: Partial<TString> = {}): TString {
  return {
    masterId: 1,
    languageId: 1,
    text: "Hello",
    history: [],
    ...overrides
  };
}

function makeDocString(overrides: Partial<DocString> = {}): DocString {
  return {
    type: "content",
    xpath: "/root/p[1]",
    motherTongue: false,
    text: "Hello",
    ...overrides
  };
}

describe("pushDocument thunk", () => {
  const mockPostFile = WebAPIClient.postFile as jest.Mock;

  beforeEach(() => {
    mockPostFile.mockReset();
  });

  it("posts file and dispatches add lesson and tStrings when data returned", async () => {
    const lesson = makeLesson({ lessonId: 5 });
    const tStrings = [makeTString({ masterId: 1, languageId: 2 })];
    mockPostFile.mockResolvedValue({ lesson, tStrings });

    const dispatch = jest.fn();
    const file = new File(["content"], "test.odt");
    const meta = { languageId: 2, lessonId: 5 };

    const result = await pushDocument(file, meta)(jest.fn(), dispatch);

    expect(mockPostFile).toHaveBeenCalledWith(
      "/api/admin/documents",
      "document",
      file,
      meta
    );
    expect(dispatch).toHaveBeenCalledWith(lessonSlice.actions.add([lesson]));
    expect(dispatch).toHaveBeenCalledWith(tStringSlice.actions.add(tStrings));
    expect(result).toEqual(lesson);
  });

  it("dispatches docStrings add when docStrings are present in response", async () => {
    const lesson = makeLesson({ lessonId: 5 });
    const tStrings = [makeTString()];
    const docStrings = [makeDocString()];
    mockPostFile.mockResolvedValue({ lesson, tStrings, docStrings });

    const dispatch = jest.fn();
    const file = new File(["content"], "test.odt");
    const meta = { languageId: 2, lessonId: 5 };

    await pushDocument(file, meta)(jest.fn(), dispatch);

    expect(dispatch).toHaveBeenCalledWith(
      docStringSlice.actions.add({
        languageId: 2,
        lessonId: 5,
        docStrings
      })
    );
  });

  it("does not dispatch docStrings add when docStrings absent from response", async () => {
    const lesson = makeLesson({ lessonId: 5 });
    const tStrings = [makeTString()];
    mockPostFile.mockResolvedValue({ lesson, tStrings });

    const dispatch = jest.fn();
    const file = new File(["content"], "test.odt");
    const meta = { languageId: 2, lessonId: 5 };

    await pushDocument(file, meta)(jest.fn(), dispatch);

    const docStringCalls = dispatch.mock.calls.filter(
      ([action]) => action.type === docStringSlice.actions.add.type
    );
    expect(docStringCalls).toHaveLength(0);
  });

  it("returns null and does not dispatch when postFile returns null", async () => {
    mockPostFile.mockResolvedValue(null);

    const dispatch = jest.fn();
    const file = new File(["content"], "test.odt");
    const meta = { languageId: 2, lessonId: 5 };

    const result = await pushDocument(file, meta)(jest.fn(), dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe("pushLessonStrings thunk", () => {
  it("posts docStrings and dispatches add lesson and tStrings", async () => {
    const lesson = makeLesson({ lessonId: 7 });
    const tStrings = [makeTString({ masterId: 2 })];
    const docStrings = [makeDocString({ text: "Content" })];
    const post = jest.fn().mockResolvedValue({ lesson, tStrings });
    const dispatch = jest.fn();

    const result = await pushLessonStrings(7, docStrings)(post, dispatch);

    expect(post).toHaveBeenCalledWith(
      "/api/admin/lessons/:lessonId/strings",
      { lessonId: 7 },
      docStrings
    );
    expect(dispatch).toHaveBeenCalledWith(lessonSlice.actions.add([lesson]));
    expect(dispatch).toHaveBeenCalledWith(tStringSlice.actions.add(tStrings));
    expect(result).toEqual(lesson);
  });

  it("returns null and does not dispatch when post returns null", async () => {
    const docStrings = [makeDocString()];
    const post = jest.fn().mockResolvedValue(null);
    const dispatch = jest.fn();

    const result = await pushLessonStrings(7, docStrings)(post, dispatch);

    expect(dispatch).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
