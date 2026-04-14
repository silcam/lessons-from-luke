import { renderHook } from "../testRenderHook";
import usePreviewScroll from "./usePreviewScroll";
import { LessonTString } from "./useLessonTStrings";

const makeLessonTString = (lessonStringId: number): LessonTString => ({
  lStr: {
    lessonStringId,
    lessonId: 1,
    masterId: 100,
    lessonVersion: 1,
    type: "content",
    xpath: "/body/p[1]",
    motherTongue: false
  },
  tStrs: []
});

describe("usePreviewScroll", () => {
  it("returns a ref object", () => {
    const { result } = renderHook(() => usePreviewScroll(undefined));
    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("current");
  });

  it("returns a ref with null current when no element is attached", () => {
    const { result } = renderHook(() => usePreviewScroll(undefined));
    expect(result.current.current).toBeNull();
  });

  it("does not throw when selectedLTStr is provided but scrollDiv is not attached", () => {
    const ltStr = makeLessonTString(42);
    expect(() => {
      renderHook(() => usePreviewScroll(ltStr));
    }).not.toThrow();
  });

  it("does not throw when selectedLTStr changes to undefined", () => {
    const ltStr = makeLessonTString(1);
    const { rerender } = renderHook(() => usePreviewScroll(ltStr));

    expect(() => {
      rerender();
    }).not.toThrow();
  });
});
