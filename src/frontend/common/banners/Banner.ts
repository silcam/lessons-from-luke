export type ErrorBanner = {
  type: "Error";
  message: string;
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
