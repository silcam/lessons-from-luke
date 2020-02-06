import {
  GetRoute,
  APIGet,
  PostRoute,
  APIPost
} from "../../../core/interfaces/Api";
import React, { useContext, useEffect, useState } from "react";
import { AppDispatch } from "../state/appState";
import { useDispatch } from "react-redux";
import { AppError, asAppError, AppErrorHandler } from "../AppError/AppError";
import { AppBanner, unknownErrorBanner } from "../banners/Banner";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "./loadingSlice";

export type GetRequest = <T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
) => Promise<APIGet[T][1] | null>;

export type PostRequest = <T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1]
) => Promise<APIPost[T][2] | null>;

const RequestContext = React.createContext<{
  get: GetRequest;
  post: PostRequest;
}>({
  get: async () => null,
  post: async () => null
});

export default RequestContext;

const noConnectionBanner: AppBanner = {
  type: "Error",
  message: "NoConnection",
  closeable: false,
  status: ""
};
const serverErrorBanner = (status: number): AppBanner => ({
  type: "Error",
  message: "serverError",
  closeable: true,
  status: status.toString()
});

function networkErrorBannerAction(err: AppError) {
  return bannerSlice.actions.add(
    err.type == "No Connection"
      ? noConnectionBanner
      : err.type == "HTTP"
      ? serverErrorBanner(err.status)
      : unknownErrorBanner()
  );
}

export type Loader<T> = (
  get: GetRequest
) => (dispatch: AppDispatch) => Promise<T>;
export function useLoad<T>(loader: Loader<T>, deps: any[] = []) {
  const { get } = useContext(RequestContext);
  const [loading, setLoading] = useState(true);
  const dispatch: AppDispatch = useDispatch();

  useEffect(() => {
    dispatch(loadingSlice.actions.addLoading());
    dispatch(loader(get))
      .catch(anyErr => {
        const err = asAppError(anyErr);
        dispatch(networkErrorBannerAction(err));
      })
      .finally(() => {
        dispatch(loadingSlice.actions.subtractLoading());
        setLoading(false);
      });
  }, deps);

  return loading;
}

export function useLoadMultiple(loaders: Loader<any>[]) {
  const loadings = loaders.map(loader => useLoad(loader));
  return loadings.every(loading => loading);
}

export type Pusher<T> = (
  post: PostRequest,
  dispatch: AppDispatch
) => Promise<T | null>;
export function usePush() {
  const { post } = useContext(RequestContext);
  const dispatch: AppDispatch = useDispatch();
  const push = <T>(
    pusher: Pusher<T>,
    errorHandler: AppErrorHandler = () => false
  ) => {
    dispatch(loadingSlice.actions.addLoading());
    return pusher(post, dispatch)
      .catch(anyErr => {
        const err = asAppError(anyErr);
        if (!errorHandler(err)) {
          dispatch(networkErrorBannerAction(err));
        }
      })
      .finally(() => {
        dispatch(loadingSlice.actions.subtractLoading());
      });
  };
  return push;
}
