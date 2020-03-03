import { useAppSelector } from "../state/appState";
import { findBy } from "../../../core/util/arrayUtils";
import { LessonString } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { lessonStringsFromLesson } from "../../../core/models/Lesson";
import { useMemo } from "react";

export type LessonTString = {
  lStr: LessonString;
  tStrs: (TString | undefined)[];
};
export type LessonTStrings = LessonTString[];

export default function useLessonTStrings(
  lessonId: number,
  languageIds: number[],
  opts: { contentOnly?: boolean } = {}
) {
  const lesson = useAppSelector(state =>
    findBy(state.lessons, "lessonId", lessonId)
  );
  const allTStrings = useAppSelector(state => state.tStrings);

  const lessonTStrings = useMemo(() => {
    let lessonStrings = lesson ? lessonStringsFromLesson(lesson) : [];
    if (opts.contentOnly)
      lessonStrings = lessonStrings.filter(ls => ls.type == "content");
    const tStrings = allTStrings.filter(str =>
      languageIds.includes(str.languageId)
    );
    return lessonStrings.map(lStr => ({
      lStr,
      tStrs: languageIds.map(id =>
        tStrings.find(
          tStr => tStr.masterId == lStr.masterId && tStr.languageId == id
        )
      )
    }));
  }, [lesson, allTStrings]);

  return { lesson, lessonTStrings };
}
