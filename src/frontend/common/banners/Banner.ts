import { AppError } from "../../../core/models/AppError";

export type AppBanner =
  | {
      type: "Error";
      error: AppError;
    }
  | { type: "Success"; message: string; networkConnectionRestored?: boolean };
