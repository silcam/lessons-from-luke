import React, { useState } from "react";
import { Language } from "../../../core/models/Language";
import { useLoadMultiple, useLoad } from "../api/RequestContext";
import { loadTStrings } from "../state/tStringSlice";
import TranslateRow from "./TranslateRow";
import { lessonName } from "../../../core/models/Lesson";
import Div from "../base-components/Div";
import Heading from "../base-components/Heading";
import PDiv from "../base-components/PDiv";
import { loadLesson } from "../state/lessonSlice";
import useLessonTStrings from "./useLessonTStrings";
import Label from "../base-components/Label";
import useTranslation from "../util/useTranslation";
import SelectInput from "../base-components/SelectInput";
import { useAppSelector } from "../state/appState";

interface IProps {
  language: Language;
  lessonId: number;
}

export default function TranslateLesson(props: IProps) {
  const t = useTranslation();
  const lessonId = props.lessonId;
  const languages = useAppSelector(state => state.languages.languages);
  const [srcLangId, setSrcLangId] = useState(props.language.defaultSrcLang);
  const { lesson, lessonTStrings } = useLessonTStrings(
    props.lessonId,
    [srcLangId, props.language.languageId],
    { contentOnly: props.language.motherTongue }
  );

  let loading = useLoadMultiple([
    loadLesson(lessonId),
    loadTStrings(props.language.languageId, lessonId)
  ]);
  loading = useLoad(loadTStrings(srcLangId, lessonId), [srcLangId]) || loading;

  return (
    <Div>
      <Heading level={1} text={lessonName(lesson)} />
      <Label text={t("Source_language")}>
        <SelectInput
          value={`${srcLangId}`}
          setValue={v => setSrcLangId(parseInt(v))}
          options={languages.map(lng => [`${lng.languageId}`, lng.name])}
        />
      </Label>
      {lessonTStrings.map(ltStr => (
        <PDiv key={ltStr.lStr.lessonStringId}>
          <TranslateRow lessonTString={ltStr} language={props.language} />
        </PDiv>
      ))}
    </Div>
  );
}
