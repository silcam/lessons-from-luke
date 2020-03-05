import { AppError } from "../AppError/AppError";

export type AppBanner =
  | {
      type: "Error";
      error: AppError;
    }
  | { type: "Success"; message: string; networkConnectionRestored?: boolean };
