import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { useLoadMultiple } from "../api/RequestContext";
import { loadTStrings } from "../state/tStringSlice";
import TranslateRow from "./TranslateRow";
import { lessonName } from "../../../core/models/Lesson";
import Div from "../base-components/Div";
import Heading from "../base-components/Heading";
import PDiv from "../base-components/PDiv";
import { loadLesson } from "../state/lessonSlice";
import useLessonTStrings from "./useLessonTStrings";

interface IProps {
  language: Language;
  lessonId: number;
}

export default function TranslateLesson(props: IProps) {
  const lessonId = props.lessonId;
  const [srcLangId, setSrcLangId] = useState(1);
  const { lesson, lessonTStrings } = useLessonTStrings(props.lessonId, [
    srcLangId,
    props.language.languageId
  ]);

  const loading = useLoadMultiple([
    loadLesson(lessonId),
    loadTStrings(props.language.languageId, lessonId),
    loadTStrings(srcLangId, lessonId)
  ]);

  return (
    <Div>
      <Heading level={1} text={lessonName(lesson)} />
      {lessonTStrings.map(ltStr => (
        <PDiv key={ltStr.lStr.lessonStringId}>
          <TranslateRow lessonTString={ltStr} language={props.language} />
        </PDiv>
      ))}
    </Div>
  );
}
