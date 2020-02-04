import React, { useState, CSSProperties } from "react";
import { LessonString } from "../../../core/models/LessonString";
import { TString, newTString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import { usePush } from "../api/RequestContext";
import { pushTString } from "../state/tStringSlice";

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
    "saved" | "needToSave" | "saving"
  >("saved");
  const setText = (text: string) => {
    setInputState("needToSave");
    _setText(text);
  };

  const push = usePush();
  const save = async () => {
    if (inputState == "saved") return;

    setInputState("saving");
    const savedStr = await push(
      pushTString(newTString(text, lessonString, language, srcStr), language)
    );
    setInputState(savedStr ? "saved" : "needToSave");
  };

  const inputStyle: CSSProperties =
    inputState == "saved"
      ? { borderColor: "green" }
      : inputState == "needToSave"
      ? { borderColor: "red" }
      : { borderColor: "yellow" };

  return (
    <tr>
      <td>{srcStr && srcStr.text}</td>
      <td>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          style={{ ...inputStyle, width: "100%" }}
          onBlur={save}
        />
      </td>
    </tr>
  );
}
