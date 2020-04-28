import React from "react";
import { TString } from "../../../core/models/TString";
import useTranslation from "../util/useTranslation";
import List from "../base-components/List";
import Heading from "../base-components/Heading";

interface IProps {
  tString?: TString;
}

export default function TStringHistoryView(props: IProps) {
  const t = useTranslation();

  if (!props.tString || props.tString.history.length == 0) return null;

  return (
    <div>
      <Heading level={4} text={t("History")} />
      <List items={props.tString.history} renderItem={text => text} />
    </div>
  );
}
