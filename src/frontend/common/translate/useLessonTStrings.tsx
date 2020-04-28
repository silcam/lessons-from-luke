import { useAppSelector } from "../state/appState";
import { findBy, count } from "../../../core/util/arrayUtils";
import { LessonString } from "../../../core/models/LessonString";
import { TString } from "../../../core/models/TString";
import { lessonStringsFromLesson } from "../../../core/models/Lesson";
import { useMemo, useEffect, useContext } from "react";
import { useDispatch } from "react-redux";
import languageSlice from "../state/languageSlice";
import { LessonProgress } from "../../../core/models/Language";
import PlatformContext from "../PlatformContext";
import RequestContext from "../api/RequestContext";

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
  const postProgress = usePostProgress();

  const targetLanguage = useAppSelector(state => state.languages.translating);
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
    if (opts.updateProgress && lessonTStrings.length > 0 && targetLanguage) {
      const lessonProgress = Math.round(
        (100 *
          count(
            lessonTStrings,
            ltStr =>
              !!ltStr.tStrs[1]?.text ||
              (targetLanguage.motherTongue && !ltStr.lStr.motherTongue)
          )) /
          lessonTStrings.length
      );
      dispatch(
        languageSlice.actions.setProgress({
          languageId: languageIds[1],
          lessonId,
          progress: lessonProgress
        })
      );
      postProgress({ lessonId, progress: lessonProgress });
    }
  }, [lessonTStrings, opts.updateProgress]);

  return { lesson, lessonTStrings };
}

function usePostProgress(): (lessonProgress: LessonProgress) => void {
  const desktop = useContext(PlatformContext) == "desktop";
  const { post } = useContext(RequestContext);

  if (!desktop) return () => {};

  return (lessonProgress: LessonProgress) =>
    post("/api/syncState/progress", {}, lessonProgress);
}
