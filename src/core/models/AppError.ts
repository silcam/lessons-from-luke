import { objKeys } from "../util/objectUtils";

export type AppError =
  | { type: "No Connection" }
  | { type: "HTTP"; status: number }
  | { type: "Unknown" };
export type AppErrorType = AppError["type"];

const appErrorModels: AppError[] = [
  { type: "No Connection" },
  { type: "HTTP", status: 0 },
  { type: "Unknown" }
];

export function isAppError(err: any): err is AppError {
  const appErrorModel = appErrorModels.find(model => model.type === err.type);
  if (!appErrorModel) return false;
  return objKeys(appErrorModel).every(
    key => typeof appErrorModel[key] === typeof err[key]
  );
}

export function asAppError(err: any): AppError {
  return isAppError(err) ? err : { type: "Unknown" };
}

export type AppErrorHandler = (err: AppError) => boolean; // Return value indicates if the error was handled
