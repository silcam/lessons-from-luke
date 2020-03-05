import React, { useState, useEffect } from "react";
import { newTString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import { usePush } from "../api/RequestContext";
import { pushTStrings } from "../state/tStringSlice";
import { StatusfulTextArea } from "../base-components/TextArea";
import Div from "../base-components/Div";
import TStringSpan from "../base-components/TStringSpan";
import PDiv from "../base-components/PDiv";
import { LessonTString } from "./useLessonTStrings";
import { useNetworkConnectionRestored } from "../../common/state/networkSlice";

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
  const { onConnectionRestored } = useNetworkConnectionRestored();
  const save = async () => {
    if (inputState == "none") return;

    setInputState("working");
    const savedStr = await push(
      pushTStrings(
        [newTString(text, lessonString, language, srcStr)],
        language
      ),
      err => {
        if (err.type == "No Connection") onConnectionRestored(save);
        return false;
      }
    );
    setInputState(savedStr ? "clean" : "dirty");
  };

  useEffect(() => {
    if (inputState == "dirty") props.markDirty();
    if (inputState == "clean") props.markClean();
  }, [inputState]);

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
          value={
            ["none", "clean"].includes(inputState) ? tStr?.text || "" : text
          }
          setValue={setText}
          status={inputState}
          onBlur={save}
          placeholder={language.name}
        />
      )}
    </Div>
  );
}
