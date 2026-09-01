import { SyncState } from "../../core/models/SyncState";

/**
 * Desktop-only extension of the isomorphic `SyncState`.
 *
 * `paired` and `pairedUserName` are Electron desktop-auth concerns (RFC 8628
 * device pairing) and must NOT appear in the shared `SyncState` domain model.
 * Any code that needs both the sync state and the pairing status should combine
 * fields from `state.syncState` and `state.desktopPairing` in the Redux store.
 */
export interface DesktopSyncState extends SyncState {
  paired: boolean;
  pairedUserName?: string;
}
