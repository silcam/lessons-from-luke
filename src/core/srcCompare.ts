import { SrcStrings } from "./SrcString";

interface CompLang {
  name: string;
  lessons: SrcStrings[];
}
interface ComparisonError {
  error: string;
  lessonIndex?: number;
}
interface Comparison {
  percent: number;
  errors: ComparisonError[];
}
export default function srcCompare(
  aLang: CompLang,
  bLang: CompLang
): Comparison {
  const errors: ComparisonError[] = [];
  const { name: aName, lessons: aLessons } = aLang;
  const { name: bName, lessons: bLessons } = bLang;

  if (aLessons.length !== bLessons.length)
    errors.push({
      error: `Lesson mismatch: ${aName} has ${aLessons.length} lessons, but ${bName} has ${bLessons.length} lessons.`
    });

  const lessonCount = Math.min(aLessons.length, bLessons.length);
  const lessonWeight =
    percentSame(aLessons.length, bLessons.length) / lessonCount;
  let totalWeight = 0.0;

  for (let lessonIndex = 0; lessonIndex < lessonCount; ++lessonIndex) {
    const lessonNum = lessonIndex + 1;
    const aLesson = aLessons[lessonIndex];
    const bLesson = bLessons[lessonIndex];

    const aLessonMTStrings = aLesson.filter(s => s.mtString).length;
    const bLessonMTStrings = bLesson.filter(s => s.mtString).length;
    if (aLessonMTStrings !== bLessonMTStrings)
      errors.push({
        error: `Lesson ${lessonNum}: ${aName} has ${aLessonMTStrings} MT strings, but ${bName} has ${bLessonMTStrings}.`,
        lessonIndex
      });

    totalWeight +=
      lessonWeight * percentSame(aLessonMTStrings, bLessonMTStrings);
  }

  const percent = Math.round(100 * totalWeight);
  return { percent, errors };
}

function percentSame(a: number, b: number) {
  return a > b ? b / a : a / b;
}
