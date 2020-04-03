import { SyncState } from "../models/SyncState";
import { AppError } from "../models/AppError";

export const ON_SYNC_STATE_CHANGE = "onSyncStateChange";
export type OnSyncStateChangePayload = Partial<SyncState>;

export const ON_ERROR = "onError";
export type OnErrorPayload = AppError;
