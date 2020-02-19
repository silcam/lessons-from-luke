import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { useAppSelector } from "../state/appState";
import { useLoadMultiple } from "../api/RequestContext";
import { loadLessonStrings } from "../state/lessonStringSlice";
import { loadTStrings } from "../state/tStringSlice";
import TranslateRow from "./TranslateRow";
import LoadingSwirl from "../base-components/LoadingSwirl";
import { lessonName } from "../../../core/models/Lesson";
import { LanguageLesson } from "../../../core/models/LanguageLesson";
import Div from "../base-components/Div";
import Heading from "../base-components/Heading";
import PDiv from "../base-components/PDiv";

interface IProps {
  language: Language;
  lesson: LanguageLesson;
}

export default function TranslateLesson(props: IProps) {
  const lesson = props.lesson;
  const lessonVersionId = props.lesson.lessonVersionId;
  const [srcLangId, setSrcLangId] = useState(2);

  const loading = useLoadMultiple([
    loadLessonStrings({ lessonVersionId: lessonVersionId }),
    loadTStrings(props.language.languageId, lessonVersionId),
    loadTStrings(srcLangId, lessonVersionId)
  ]);

  const lessonStrings = useAppSelector(state =>
    state.lessonStrings.filter(str => str.lessonVersionId == lessonVersionId)
  );
  const tStrings = useAppSelector(state =>
    state.tStrings.filter(str =>
      [srcLangId, props.language.languageId].includes(str.languageId)
    )
  );

  if (loading) return <LoadingSwirl />;

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
