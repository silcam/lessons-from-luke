import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { useAppSelector } from "../state/appState";
import { useLoad } from "../api/RequestContext";
import { loadLessonStrings } from "../state/lessonStringSlice";
import { loadTStrings } from "../state/tStringSlice";
import TranslateRow from "./TranslateRow";
import Loading from "../api/Loading";

interface IProps {
  language: Language;
  lessonVersionId: number;
}

export default function TranslateLesson(props: IProps) {
  const [srcLangId, setSrcLangId] = useState(2);
  const ldg1 = useLoad(
    loadLessonStrings({ lessonVersionId: props.lessonVersionId })
  );
  const ldg2 = useLoad(
    loadTStrings(props.language.languageId, props.lessonVersionId)
  );
  const ldg3 = useLoad(loadTStrings(srcLangId, props.lessonVersionId));
  const loading = ldg1 || ldg2 || ldg3;
  const lessonStrings = useAppSelector(state =>
    state.lessonStrings.filter(
      str => str.lessonVersionId == props.lessonVersionId
    )
  );
  const tStrings = useAppSelector(state =>
    state.tStrings.filter(str =>
      [srcLangId, props.language.languageId].includes(str.languageId)
    )
  );

  const lesson = useAppSelector(state =>
    state.languageLessons.find(
      lesson =>
        lesson.languageId == props.language.languageId &&
        lesson.lessonVersionId == props.lessonVersionId
    )
  );
  if (!lesson) return null;

  if (loading) return <Loading />;

  return (
    <div>
      <h1>{`${lesson.book} ${lesson.series}-${lesson.lesson}`}</h1>
      <table style={{ width: "100%" }}>
        <tbody>
          {lessonStrings.map(lessonString => (
            <TranslateRow
              key={lessonString.lessonStringId}
              {...{
                lessonString,
                tStrings,
                srcLangId,
                language: props.language
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
