import { SyncState } from "../models/SyncState";
import { AppError } from "../models/AppError";

export const ON_SYNC_STATE_CHANGE = "onSyncStateChange";
/**
 * IPC payload for sync-state updates pushed from main → renderer.
 * Contains only isomorphic domain fields — desktop-only pairing fields
 * are kept separate in `DesktopPairingIpcFields`.
 */
export type OnSyncStateChangePayload = Partial<SyncState>;

/**
 * Desktop-only pairing fields carried alongside `OnSyncStateChangePayload`
 * in the IPC push. Defined here so both the main-process sender
 * (`syncStateController`) and the renderer receiver (`useHandleIPCEvents`)
 * share the field names without polluting the isomorphic core type.
 */
export interface DesktopPairingIpcFields {
  paired?: boolean;
  pairedUserName?: string;
}

export const ON_ERROR = "onError";
export type OnErrorPayload = AppError;

// Device pairing IPC channels (renderer → main via invoke)
export const PAIRING_START = "pairingStart";
export interface PairingStartResult {
  userCode: string;
}

export const PAIRING_CANCEL = "pairingCancel";
export const PAIRING_DISCONNECT = "pairingDisconnect";

// Device pairing IPC events (main → renderer via send)
export const ON_PAIRING_ERROR = "onPairingError";
export type PairingErrorReason = "expired" | "declined" | "error";
export interface OnPairingErrorPayload {
  reason: PairingErrorReason;
}

/**
 * Advisory push from main → renderer carrying the user code once obtained.
 * Currently informational only — the renderer also receives the code as the
 * return value of its invoke(PAIRING_START) call.
 */
export const PAIRING_USER_CODE = "pairingUserCode";

/** IPC query (renderer → main via invoke) for current pairing state. */
export const DEVICE_STATE = "device:state";
