import { AllGetRoute, AllAPIGet, AllPostRoute, AllAPIPost } from "../../../core/api/ApiContracts";
import React from "react";

// GetRequest / PostRequest use the *all-routes* maps so that common components
// (e.g. syncStateSlice, useLessonTStrings) can call both web-only and
// desktop-only routes through the context.  The concrete provider implementations
// (webGet in the browser, ipcGet in Electron) are responsible for handling the
// routes that are valid for their platform.
export type GetRequest = <T extends AllGetRoute>(
  route: T,
  params: AllAPIGet[T][0]
) => Promise<AllAPIGet[T][1] | null>;

export type PostRequest = <T extends AllPostRoute>(
  route: T,
  params: AllAPIPost[T][0],
  data: AllAPIPost[T][1]
) => Promise<AllAPIPost[T][2] | null>;

const RequestContext = React.createContext<{
  get: GetRequest;
  post: PostRequest;
}>({
  get: async () => null,
  post: async () => null,
});

export default RequestContext;
