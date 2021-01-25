import React from "react";
import { TString } from "../../../core/models/TString";
import { Language } from "../../../core/models/Language";
import { usePush } from "../api/useLoad";
import { pushTStrings } from "../state/tStringSlice";
import StatusfulTextArea from "../base-components/StatusfulTextArea";
import { useNetworkConnectionRestored } from "../../common/state/networkSlice";

interface IProps {
  tString: TString;
  language: Language;
  markDirty: () => void;
  markClean: () => void;
}

export default function TStringInput(props: IProps) {
  const push = usePush();
  const { onConnectionRestored } = useNetworkConnectionRestored();

  const save = async (text: string) => {
    const savedStr = await push(
      pushTStrings([{ ...props.tString, text }], props.language),
      err => {
        if (err.type == "No Connection") onConnectionRestored(() => save(text));
        return false;
      }
    );
    return !!savedStr;
  };

  return (
    <StatusfulTextArea
      value={props.tString.text}
      saveValue={save}
      markClean={props.markClean}
      markDirty={props.markDirty}
      placeholder={props.language.name}
    />
  );
}
