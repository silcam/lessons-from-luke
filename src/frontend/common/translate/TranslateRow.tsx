import React from "react";
import { newTString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import Div from "../base-components/Div";
import TStringSpan from "../base-components/TStringSpan";
import PDiv from "../base-components/PDiv";
import { LessonTString } from "./useLessonTStrings";
import TStringInput from "./TStringInput";

interface IProps {
  lessonTString: LessonTString;
  language: Language;
  markDirty: () => void;
  markClean: () => void;
}

export default function TranslateRow(props: IProps) {
  const { lessonTString, language } = props;
  const lessonString = lessonTString.lStr;
  const srcStr = lessonTString.tStrs[0];
  const tStr =
    lessonTString.tStrs[1] || newTString("", lessonString, language, srcStr);

  return (
    <Div>
      <PDiv>
        <TStringSpan
          text={srcStr?.text}
          motherTongue={lessonString.motherTongue}
        />
      </PDiv>

      {lessonString.motherTongue && (
        <TStringInput
          tString={tStr}
          language={language}
          markClean={props.markClean}
          markDirty={props.markDirty}
        />
      )}
    </Div>
  );
}
