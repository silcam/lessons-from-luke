import { LocalStorageInterface } from "../LocalStorage";
import { addGetHandler, addPostHandler } from "../DesktopAPIServer";
import WebAPIClientForDesktop from "../WebAPIClientForDesktop";
import { StoredSyncState } from "../../core/models/SyncState";

export default function syncStateController(
  localStorage: LocalStorageInterface,
  webClient: WebAPIClientForDesktop
) {
  addGetHandler("/api/syncState", async () => {
    return fullSyncState(localStorage.getStore().syncState, webClient);
  });

  addPostHandler("/api/syncState/code", async (_, data) => {
    const language = await webClient.get("/api/languages/code/:code", data);
    if (language) {
      localStorage.updateStore(store => {
        store.syncState.language = language;
      });
    }
    return fullSyncState(localStorage.getStore().syncState, webClient);
  });
}

function fullSyncState(
  syncState: StoredSyncState,
  webClient: WebAPIClientForDesktop
) {
  return { ...syncState, connected: webClient.isConnected(), loaded: true };
}
