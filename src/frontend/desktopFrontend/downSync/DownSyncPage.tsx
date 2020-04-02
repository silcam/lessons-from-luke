import React from "react";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import SyncCodeForm from "./SyncCodeForm";
import { useAppSelector } from "../../common/state/appState";

export default function DownSyncPage() {
  const syncState = useAppSelector(state => state.syncState);

  return (
    <StdHeaderBarPage title="Lessons from Luke" logoNoLink>
      {syncState.language ? (
        <h1>{syncState.language.name}</h1>
      ) : (
        <SyncCodeForm />
      )}
    </StdHeaderBarPage>
  );
}
