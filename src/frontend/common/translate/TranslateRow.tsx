import React from "react";
import { newTString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import { usePush } from "../api/RequestContext";
import { pushTStrings } from "../state/tStringSlice";
import StatusfulTextArea from "../base-components/StatusfulTextArea";
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

  const push = usePush();
  const { onConnectionRestored } = useNetworkConnectionRestored();

  const save = async (text: string) => {
    const savedStr = await push(
      pushTStrings(
        [newTString(text, lessonString, language, srcStr)],
        language
      ),
      err => {
        if (err.type == "No Connection") onConnectionRestored(() => save(text));
        return false;
      }
    );
    return !!savedStr;
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
          value={tStr?.text || ""}
          saveValue={save}
          markClean={props.markClean}
          markDirty={props.markDirty}
          placeholder={language.name}
        />
      )}
    </Div>
  );
}
