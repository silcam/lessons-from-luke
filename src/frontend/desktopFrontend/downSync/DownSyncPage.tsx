import React, { useEffect, useState } from "react";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import SyncCodeForm from "./SyncCodeForm";
import { useAppSelector } from "../../common/state/appState";
import { useDesktopAppSelector } from "../desktopAppState";
import useTranslation from "../../common/util/useTranslation";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import Button from "../../common/base-components/Button";
import ProgressBar from "../../common/base-components/ProgressBar";
import ConnectAccount from "../ConnectAccount";
import { ipcDesktopGet } from "../desktopAPIClient";

interface IProps {
  startTranslating: () => void;
}

export default function DownSyncPage(props: IProps) {
  const t = useTranslation();
  const syncState = useAppSelector((state) => state.syncState);
  const { paired } = useDesktopAppSelector((state) => state.desktopPairing);
  const progress = syncState.downSync.progress;
  const [canTranslate, setCanTranslate] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      ipcDesktopGet("/api/readyToTranslate", {}).then((data) =>
        setCanTranslate(data?.readyToTranslate || false)
      );
    }, 1000);
    return () => {
      clearInterval(interval);
    };
    // mount-only polling interval; `get` from context is stable for the page lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // !paired + connected: device is online but has no account credential.
  // Show a clear connect prompt so the user knows sync is blocked.
  if (!paired && syncState.connected) {
    return (
      <StdHeaderBarPage title="Lessons from Luke" logoNoLink>
        <MiddleOfPage>
          <ConnectAccount />
        </MiddleOfPage>
      </StdHeaderBarPage>
    );
  }

  // !paired + !connected: offline and unpaired — passive state, local cache still usable.
  // No error shown; fall through to existing sync display.
  // (paired from state.desktopPairing; connected from state.syncState)

  return (
    <StdHeaderBarPage title="Lessons from Luke" logoNoLink>
      {syncState.language ? (
        <MiddleOfPage>
          <h1>
            {t(progress == 100 ? "Synced_project" : "Syncing_project", {
              language: syncState.language.name,
            })}
          </h1>
          <ProgressBar big percent={syncState.downSync.progress || 0} />
          {(canTranslate || progress == 100) && (
            <Button bigger text={t("Start_translating")} onClick={props.startTranslating} />
          )}
        </MiddleOfPage>
      ) : (
        <SyncCodeForm />
      )}
    </StdHeaderBarPage>
  );
}
