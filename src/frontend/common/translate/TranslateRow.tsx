import React, { useState } from "react";
import { newTString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import { usePush } from "../api/RequestContext";
import { pushTString } from "../state/tStringSlice";
import { StatusfulTextArea } from "../base-components/TextArea";
import Div from "../base-components/Div";
import TStringSpan from "../base-components/TStringSpan";
import PDiv from "../base-components/PDiv";
import { LessonTString } from "./useLessonTStrings";

interface IProps {
  lessonTString: LessonTString;
  language: Language;
}

export default function TranslateRow(props: IProps) {
  const { lessonTString, language } = props;
  const lessonString = lessonTString.lStr;
  const srcStr = lessonTString.tStrs[0];
  const tStr = lessonTString.tStrs[1];

  const [text, _setText] = useState(tStr ? tStr.text : "");
  const [inputState, setInputState] = useState<
    "none" | "clean" | "dirty" | "working"
  >("none");
  const setText = (text: string) => {
    setInputState("dirty");
    _setText(text);
  };

  const push = usePush();
  const save = async () => {
    if (inputState == "none") return;

    setInputState("working");
    const savedStr = await push(
      pushTString(newTString(text, lessonString, language, srcStr), language)
    );
    setInputState(savedStr ? "clean" : "dirty");
  };

  return (
    <Div>
      <PDiv>
        <TStringSpan
          text={srcStr?.text}
          motherTongue={lessonString.motherTongue}
        />
      </PDiv>

      {lessonString.motherTongue && (
        <StatusfulTextArea
          value={inputState == "none" ? tStr?.text || "" : text}
          setValue={setText}
          status={inputState}
          onBlur={save}
          placeholder={language.name}
        />
      )}
    </Div>
  );
}
