import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { useAppSelector } from "../state/appState";
import { useLoadMultiple } from "../api/RequestContext";
import { loadTStrings } from "../state/tStringSlice";
import TranslateRow from "./TranslateRow";
import LoadingSwirl from "../base-components/LoadingSwirl";
import {
  lessonName,
  lessonStringsFromLesson
} from "../../../core/models/Lesson";
import Div from "../base-components/Div";
import Heading from "../base-components/Heading";
import PDiv from "../base-components/PDiv";
import { loadLesson } from "../state/lessonSlice";
import { findBy } from "../../../core/util/arrayUtils";

interface IProps {
  language: Language;
  lessonId: number;
}

export default function TranslateLesson(props: IProps) {
  const lessonId = props.lessonId;
  const [srcLangId, setSrcLangId] = useState(2);

  const loading = useLoadMultiple([
    loadLesson(lessonId),
    loadTStrings(props.language.languageId, lessonId),
    loadTStrings(srcLangId, lessonId)
  ]);

  const lesson = useAppSelector(state =>
    findBy(state.lessons, "lessonId", lessonId)
  );
  const lessonStrings = lesson ? lessonStringsFromLesson(lesson) : [];
  const tStrings = useAppSelector(state =>
    state.tStrings.filter(str =>
      [srcLangId, props.language.languageId].includes(str.languageId)
    )
  );

  if (loading || !lesson || lessonStrings.length == 0) return <LoadingSwirl />;

  return (
    <Div>
      <Heading level={1} text={lessonName(lesson)} />
      {lessonStrings.map(lessonString => (
        <PDiv key={lessonString.lessonStringId}>
          <TranslateRow
            key={lessonString.lessonStringId}
            {...{
              lessonString,
              tStrings,
              srcLangId,
              language: props.language
            }}
          />
        </PDiv>
      ))}
    </Div>
  );
}
