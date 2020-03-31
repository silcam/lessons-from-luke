import React from "react";
import { Language } from "../../../core/models/Language";
import TranslateRow from "./TranslateRow";
import { lessonName, BaseLesson } from "../../../core/models/Lesson";
import Div from "../base-components/Div";
import Heading from "../base-components/Heading";
import PDiv from "../base-components/PDiv";
import { LessonTString } from "./useLessonTStrings";
import Label from "../base-components/Label";
import useTranslation from "../util/useTranslation";
import SelectInput from "../base-components/SelectInput";
import { useAppSelector } from "../state/appState";
import useDirtyState from "./useDirtyState";

interface IProps {
  lesson?: BaseLesson;
  lessonTStrings: LessonTString[];
  language: Language;
  srcLangId: number;
  setSrcLangId: (id: number) => void;
  onDirtyStateChange: (dirty: boolean) => void;
}

export default function TranslateFallback(props: IProps) {
  const t = useTranslation();
  const languages = useAppSelector(state => state.languages.languages);

  const { setDirty, setClean } = useDirtyState(props.onDirtyStateChange);

  return (
    <Div pad>
      <Heading level={1} text={lessonName(props.lesson, t)} />
      <Label text={t("Source_language")}>
        <SelectInput
          value={`${props.srcLangId}`}
          setValue={v => props.setSrcLangId(parseInt(v))}
          options={languages.map(lng => [`${lng.languageId}`, lng.name])}
        />
      </Label>
      {props.lessonTStrings.map(ltStr => (
        <PDiv key={ltStr.lStr.lessonStringId}>
          <TranslateRow
            lessonTString={ltStr}
            language={props.language}
            markDirty={() => setDirty(ltStr.lStr.lessonId)}
            markClean={() => setClean(ltStr.lStr.lessonId)}
          />
        </PDiv>
      ))}
    </Div>
  );
}
