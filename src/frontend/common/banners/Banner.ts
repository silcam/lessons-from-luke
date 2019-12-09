import { I18nKey } from "../../locales/en";

export type ErrorBanner = {
  type: "Error";
  message: I18nKey;
  closeable: boolean;
  status: string;
};
export type AppBanner = ErrorBanner | { type: "Hello World" };

export function unknownErrorBanner(): AppBanner {
  return {
    type: "Error",
    message: "UnknownError",
    closeable: true,
    status: ""
  };
}
