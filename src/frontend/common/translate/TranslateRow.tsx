import React, { useState, CSSProperties } from "react";
import { LessonString } from "../../../core/models/LessonString";
import { TString, newTString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import { usePush } from "../api/RequestContext";
import { pushTString } from "../state/tStringSlice";
import { StatusfulTextInput } from "../base-components/TextInput";
import { StatusfulTextArea } from "../base-components/TextArea";
import Div from "../base-components/Div";

interface IProps {
  lessonString: LessonString;
  tStrings: TString[];
  srcLangId: number;
  language: Language;
}

export default function TranslateRow(props: IProps) {
  const { lessonString, tStrings, srcLangId, language } = props;
  const srcStr = tStrings.find(
    str => str.languageId == srcLangId && str.masterId == lessonString.masterId
  );
  const tStr = tStrings.find(
    str =>
      str.languageId == language.languageId &&
      str.masterId == lessonString.masterId
  );
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
  if (!srcStr) return <span>"-----------"</span>;

  return (
    <Div>
      <div
        style={{ fontWeight: lessonString.motherTongue ? "bold" : "normal" }}
      >
        {srcStr.text}
      </div>
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
