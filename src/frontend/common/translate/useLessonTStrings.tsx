import { useAppSelector } from "../state/appState";
import { findBy, count } from "../../../core/util/arrayUtils";
import { LessonString } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { lessonStringsFromLesson } from "../../../core/models/Lesson";
import { useMemo, useEffect } from "react";
import { useDispatch } from "react-redux";
import languageSlice from "../state/languageSlice";

export type LessonTString = {
  lStr: LessonString;
  tStrs: (TString | undefined)[];
};
export type LessonTStrings = LessonTString[];

export default function useLessonTStrings(
  lessonId: number,
  languageIds: number[],
  opts: { contentOnly?: boolean; updateProgress?: boolean } = {}
) {
  const dispatch = useDispatch();

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

  useEffect(() => {
    if (opts.updateProgress && lessonTStrings.length > 0) {
      const lessonProgress = Math.round(
        (100 * count(lessonTStrings, ltStr => !!ltStr.tStrs[1]?.text)) /
          lessonTStrings.length
      );
      dispatch(
        languageSlice.actions.setProgress({
          languageId: languageIds[1],
          lessonId,
          progress: lessonProgress
        })
      );
    }
  }, [lessonTStrings, opts.updateProgress]);

  return { lesson, lessonTStrings };
}
