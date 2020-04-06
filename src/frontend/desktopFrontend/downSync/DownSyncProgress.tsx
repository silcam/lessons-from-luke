import React from "react";
import { useAppSelector } from "../../common/state/appState";
import Label from "../../common/base-components/Label";
import ProgressBar from "../../common/base-components/ProgressBar";
import { count } from "../../../core/util/arrayUtils";
import PDiv from "../../common/base-components/PDiv";
import useTranslation from "../../common/util/useTranslation";

export default function DownSyncProgress() {
  const t = useTranslation();
  const syncState = useAppSelector(state => state.syncState);

  return (
    <div>
      <PDiv>
        <Label text={t("Lessons")}>
          <ProgressBar
            fixed
            percent={percent(syncState.downSync.lessonStrings)}
          />
        </Label>
      </PDiv>

      <PDiv>
        <Label text={t("Texts")}>
          <ProgressBar fixed percent={percent(syncState.downSync.tStrings)} />
        </Label>
      </PDiv>

      <PDiv>
        <Label text={t("Previews")}>
          <ProgressBar
            fixed
            percent={percent(syncState.downSync.docPreviews)}
          />
        </Label>
      </PDiv>
    </div>
  );
}

function percent(bools: boolean[]) {
  return Math.round((100 * count(bools, bool => bool)) / bools.length);
}
