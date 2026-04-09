/// <reference types="jest" />

import srcCompare from "./srcCompare";
import { SrcStrings } from "./SrcString";

function makeLesson(strings: Array<{ text: string; mtString?: boolean }>): SrcStrings {
  return strings.map((s, i) => ({ xpath: `xpath${i}`, ...s }));
}

describe("srcCompare", () => {
  test("returns 100% with no errors for identical languages", () => {
    const lesson: SrcStrings = [
      makeLesson([{ text: "Hello", mtString: true }])[0]
    ];
    const result = srcCompare(
      { name: "Lang A", lessons: [lesson] },
      { name: "Lang B", lessons: [lesson] }
    );
    expect(result.percent).toBe(100);
    expect(result.errors).toHaveLength(0);
  });

  test("reports lesson count mismatch", () => {
    const lesson = makeLesson([{ text: "Hello", mtString: true }]);
    const result = srcCompare(
      { name: "Lang A", lessons: [lesson, lesson] },
      { name: "Lang B", lessons: [lesson] }
    );
    expect(result.errors.some(e => e.error.includes("mismatch"))).toBe(true);
  });

  test("reports MT string count mismatch within a lesson", () => {
    const lessonA = makeLesson([
      { text: "Hello", mtString: true },
      { text: "World", mtString: true }
    ]);
    const lessonB = makeLesson([
      { text: "Hello", mtString: true }
    ]);
    const result = srcCompare(
      { name: "Lang A", lessons: [lessonA] },
      { name: "Lang B", lessons: [lessonB] }
    );
    expect(result.errors.some(e => e.lessonIndex === 0)).toBe(true);
  });

  test("returns 0% for completely mismatched lessons", () => {
    const lessonA = makeLesson([{ text: "Hello", mtString: true }]);
    const lessonB = makeLesson([]);
    const result = srcCompare(
      { name: "Lang A", lessons: [lessonA] },
      { name: "Lang B", lessons: [lessonB] }
    );
    expect(result.percent).toBe(0);
  });

  test("handles empty lessons arrays", () => {
    const result = srcCompare(
      { name: "Lang A", lessons: [] },
      { name: "Lang B", lessons: [] }
    );
    expect(result.errors).toHaveLength(0);
  });
});
