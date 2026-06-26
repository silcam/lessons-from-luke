import { SyncState } from "../models/SyncState";
import { AppError } from "../models/AppError";

export const ON_SYNC_STATE_CHANGE = "onSyncStateChange";
/**
 * IPC payload for sync-state updates pushed from main → renderer.
 * Extends `Partial<SyncState>` with the desktop-pairing fields so that
 * `fullSyncState()` (syncStateController) can include them in the same
 * push without requiring those fields in the isomorphic domain model.
 */
export type OnSyncStateChangePayload = Partial<SyncState> & {
  paired?: boolean;
  pairedUserName?: string;
};

export const ON_ERROR = "onError";
export type OnErrorPayload = AppError;

// Device pairing IPC channels (renderer → main via invoke)
export const PAIRING_START = "pairingStart";
export interface PairingStartResult {
  userCode: string;
}

export const PAIRING_CANCEL = "pairingCancel";
export const PAIRING_DISCONNECT = "pairingDisconnect";

// Device pairing IPC events (main → renderer via on)
export const ON_PAIRING_ERROR = "onPairingError";
export type PairingErrorReason = "expired" | "declined" | "error";
export interface OnPairingErrorPayload {
  reason: PairingErrorReason;
}
