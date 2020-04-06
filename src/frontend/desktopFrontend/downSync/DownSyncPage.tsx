import React from "react";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import SyncCodeForm from "./SyncCodeForm";
import { useAppSelector } from "../../common/state/appState";
import DownSyncProgress from "./DownSyncProgress";
import useTranslation from "../../common/util/useTranslation";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import Button from "../../common/base-components/Button";
import { readyToTranslate } from "../../../core/models/SyncState";

interface IProps {
  startTranslating: () => void;
}

export default function DownSyncPage(props: IProps) {
  const t = useTranslation();
  const syncState = useAppSelector(state => state.syncState);
  const canTranslate = readyToTranslate(syncState);

  return (
    <StdHeaderBarPage title="Lessons from Luke" logoNoLink>
      {syncState.language ? (
        <div>
          <h1>
            {t("Downloading_project", { language: syncState.language.name })}
          </h1>
          <MiddleOfPage>
            <DownSyncProgress />
            {canTranslate && (
              <Button
                bigger
                text={t("Start_translating")}
                onClick={props.startTranslating}
              />
            )}
          </MiddleOfPage>
        </div>
      ) : (
        <SyncCodeForm />
      )}
    </StdHeaderBarPage>
  );
}
