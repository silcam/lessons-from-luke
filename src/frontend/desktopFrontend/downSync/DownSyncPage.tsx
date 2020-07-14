import React, { useEffect, useContext, useState } from "react";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import SyncCodeForm from "./SyncCodeForm";
import { useAppSelector } from "../../common/state/appState";
import useTranslation from "../../common/util/useTranslation";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import Button from "../../common/base-components/Button";
import RequestContext from "../../common/api/RequestContext";
import ProgressBar from "../../common/base-components/ProgressBar";

interface IProps {
  startTranslating: () => void;
}

export default function DownSyncPage(props: IProps) {
  const t = useTranslation();
  const { get } = useContext(RequestContext);
  const syncState = useAppSelector(state => state.syncState);
  const progress = syncState.downSync.progress;
  const [canTranslate, setCanTranslate] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      get("/api/readyToTranslate", {}).then(data =>
        setCanTranslate(data?.readyToTranslate || false)
      );
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  });

  return (
    <StdHeaderBarPage title="Lessons from Luke" logoNoLink>
      {syncState.language ? (
        <MiddleOfPage>
          <h1>
            {t(progress == 100 ? "Downloaded_project" : "Downloading_project", {
              language: syncState.language.name
            })}
          </h1>
          <ProgressBar big percent={syncState.downSync.progress || 0} />
          {(canTranslate || progress == 100) && (
            <Button
              bigger
              text={t("Start_translating")}
              onClick={props.startTranslating}
            />
          )}
        </MiddleOfPage>
      ) : (
        <SyncCodeForm />
      )}
    </StdHeaderBarPage>
  );
}
