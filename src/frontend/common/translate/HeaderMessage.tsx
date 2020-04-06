import React from "react";
import useTranslation from "../util/useTranslation";
import { useAppSelector } from "../state/appState";
import Heading from "../base-components/Heading";
import Colors from "../util/Colors";

export type HdrMessage = "none" | "unsavedChanges" | "changesSaved";
interface IProps {
  hdrMessage: HdrMessage;
}

export default function HeaderMessage(props: IProps) {
  const t = useTranslation();
  const syncStatus = useAppSelector(state => state.syncState);

  if (props.hdrMessage == "none") return null;

  const headingProps =
    props.hdrMessage == "unsavedChanges"
      ? { text: t("Unsaved_changes"), color: Colors.warning }
      : syncStatus.connected && syncStatus.upSync.dirtyTStrings.length > 0
      ? { text: t("Uploading"), color: Colors.warning }
      : { text: t("Changes_saved"), color: Colors.success };

  return (
    <Heading
      level={4}
      style={{
        color: headingProps.color
      }}
      text={headingProps.text}
    />
  );
}
