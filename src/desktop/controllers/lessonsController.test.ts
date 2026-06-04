/// <reference types="jest" />

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "/tmp/fake-data"),
    isPackaged: false
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    removeHandler: jest.fn()
  }
}));

const registeredHandlers: { [route: string]: Function } = {};

jest.mock("../DesktopAPIServer", () => ({
  addGetHandler: jest.fn((route: string, handler: Function) => {
    registeredHandlers[route] = handler;
  }),
  addPostHandler: jest.fn((route: string, handler: Function) => {
    registeredHandlers[route] = handler;
  })
}));

import lessonsController from "./lessonsController";
import { BaseLesson } from "../../core/models/Lesson";
import { LessonString } from "../../core/models/LessonString";

function makeLesson(lessonId: number, overrides: Partial<BaseLesson> = {}): BaseLesson {
  return {
    lessonId,
    book: "Luke",
    series: 1,
    lesson: lessonId,
    version: 1,
    ...overrides
  };
}

function makeLessonString(masterId: number, lessonId: number): LessonString {
  return {
    lessonStringId: masterId,
    masterId,
    lessonId,
    lessonVersion: 1,
    type: "content",
    xpath: `/root[${masterId}]`,
    motherTongue: false
  };
}

function makeApp() {
  const localStorage = {
    getLessons: jest.fn(() => [] as BaseLesson[]),
    getLessonStrings: jest.fn(() => [] as LessonString[]),
    getDocPreview: jest.fn(() => "")
  };

  return { localStorage } as any;
}

describe("lessonsController", () => {
  beforeEach(() => {
    Object.keys(registeredHandlers).forEach(k => delete registeredHandlers[k]);
    jest.clearAllMocks();
  });

  describe("/api/lessons GET", () => {
    test("returns all lessons from localStorage", async () => {
      const lessons = [makeLesson(1), makeLesson(2), makeLesson(3)];
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue(lessons);
      lessonsController(app);

      const result = await registeredHandlers["/api/lessons"]();
      expect(result).toEqual(lessons);
    });

    test("returns empty array when no lessons are stored", async () => {
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue([]);
      lessonsController(app);

      const result = await registeredHandlers["/api/lessons"]();
      expect(result).toEqual([]);
    });
  });

  describe("/api/lessons/:lessonId GET", () => {
    test("returns lesson with lessonStrings when both exist", async () => {
      const lesson = makeLesson(5);
      const lessonStrings = [makeLessonString(1, 5), makeLessonString(2, 5)];
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue([lesson]);
      app.localStorage.getLessonStrings.mockReturnValue(lessonStrings);
      lessonsController(app);

      const result = await registeredHandlers["/api/lessons/:lessonId"]({ lessonId: 5 });
      expect(result).toEqual({ ...lesson, lessonStrings });
    });

    test("getLessonStrings is called with the given lessonId", async () => {
      const lesson = makeLesson(7);
      const lessonStrings = [makeLessonString(10, 7)];
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue([lesson]);
      app.localStorage.getLessonStrings.mockReturnValue(lessonStrings);
      lessonsController(app);

      await registeredHandlers["/api/lessons/:lessonId"]({ lessonId: 7 });
      expect(app.localStorage.getLessonStrings).toHaveBeenCalledWith(7);
    });

    test("throws { status: 404 } when lesson is not found", async () => {
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue([makeLesson(1)]);
      app.localStorage.getLessonStrings.mockReturnValue([]);
      lessonsController(app);

      await expect(
        registeredHandlers["/api/lessons/:lessonId"]({ lessonId: 999 })
      ).rejects.toEqual({ status: 404 });
    });

    test("throws { status: 404 } when no lessons are stored at all", async () => {
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue([]);
      app.localStorage.getLessonStrings.mockReturnValue([]);
      lessonsController(app);

      await expect(
        registeredHandlers["/api/lessons/:lessonId"]({ lessonId: 1 })
      ).rejects.toEqual({ status: 404 });
    });

    test("merges lessonStrings into the lesson object", async () => {
      const lesson = makeLesson(3);
      const lessonStrings = [makeLessonString(20, 3)];
      const app = makeApp();
      app.localStorage.getLessons.mockReturnValue([lesson]);
      app.localStorage.getLessonStrings.mockReturnValue(lessonStrings);
      lessonsController(app);

      const result = await registeredHandlers["/api/lessons/:lessonId"]({ lessonId: 3 });
      expect(result.lessonId).toBe(3);
      expect(result.lessonStrings).toEqual(lessonStrings);
    });
  });

  describe("/api/lessons/:lessonId/webified GET", () => {
    test("returns { html: preview } when preview exists", async () => {
      const app = makeApp();
      app.localStorage.getDocPreview.mockReturnValue("<html>content</html>");
      lessonsController(app);

      const result = await registeredHandlers["/api/lessons/:lessonId/webified"]({ lessonId: 2 });
      expect(result).toEqual({ html: "<html>content</html>" });
    });

    test("calls getDocPreview with the given lessonId", async () => {
      const app = makeApp();
      app.localStorage.getDocPreview.mockReturnValue("<html>test</html>");
      lessonsController(app);

      await registeredHandlers["/api/lessons/:lessonId/webified"]({ lessonId: 8 });
      expect(app.localStorage.getDocPreview).toHaveBeenCalledWith(8);
    });

    test("throws { status: 404 } when no preview exists (empty string)", async () => {
      const app = makeApp();
      app.localStorage.getDocPreview.mockReturnValue("");
      lessonsController(app);

      await expect(
        registeredHandlers["/api/lessons/:lessonId/webified"]({ lessonId: 4 })
      ).rejects.toEqual({ status: 404 });
    });

    test("throws { status: 404 } when preview is null/undefined", async () => {
      const app = makeApp();
      app.localStorage.getDocPreview.mockReturnValue(null);
      lessonsController(app);

      await expect(
        registeredHandlers["/api/lessons/:lessonId/webified"]({ lessonId: 4 })
      ).rejects.toEqual({ status: 404 });
    });
  });
});
