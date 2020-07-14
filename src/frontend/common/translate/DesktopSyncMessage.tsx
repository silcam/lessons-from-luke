import React, { useContext, useState, useEffect } from "react";
import useTranslation from "../util/useTranslation";
import PlatformContext from "../PlatformContext";
import { useAppSelector } from "../state/appState";
import { FlexRow } from "../base-components/Flex";
import ProgressBar from "../base-components/ProgressBar";
import Label from "../base-components/Label";
import { count } from "../../../core/util/arrayUtils";
import styled from "styled-components";
import Colors from "../../common/util/Colors";

export default function DesktopSyncMessage() {
  const t = useTranslation();
  const desktop = useContext(PlatformContext) == "desktop";
  const syncState = useAppSelector(state => state.syncState);

  if (!desktop) return null;

  if (!syncState.connected) return null;

  const progress = syncState.downSync.progress || 0;
  if (progress < 100) {
    return (
      <SyncMessageDiv flexZero>
        <Label text={t("Downloading")} />
        <ProgressBar fixed percent={progress} />
      </SyncMessageDiv>
    );
  }

  return <FlexRow></FlexRow>;
}

const SyncMessageDiv = styled(FlexRow)`
  padding: 0 0.4em 0.2em;
  justify-content: flex-end;
  align-items: center;
  background-color: ${Colors.darkBG};
  color: white;
`;
