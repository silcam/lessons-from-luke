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
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "./loadingSlice";
import {
  networkConnectionLostAction,
  useNetworkConnectionRestored
} from "../state/networkSlice";

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

function dispatchError(
  get: GetRequest,
  dispatch: AppDispatch,
  error: AppError
) {
  if (error.type == "No Connection") dispatch(networkConnectionLostAction(get));
  else dispatch(bannerSlice.actions.add({ type: "Error", error }));
}

export type Loader<T> = (
  get: GetRequest
) => (dispatch: AppDispatch) => Promise<T>;

export function useJustLoad(): [(ldr: Loader<any>) => void, boolean] {
  const { get } = useContext(RequestContext);
  const [loading, setLoading] = useState(false);
  const dispatch: AppDispatch = useDispatch();
  const { onConnectionRestored } = useNetworkConnectionRestored();

  const load = (loader: Loader<any>) => {
    setLoading(true);
    dispatch(loadingSlice.actions.addLoading());
    dispatch(loader(get))
      .catch(anyErr => {
        const err = asAppError(anyErr);
        dispatchError(get, dispatch, err);
        if (err.type == "No Connection")
          onConnectionRestored(() => load(loader));
      })
      .finally(() => {
        dispatch(loadingSlice.actions.subtractLoading());
        setLoading(false);
      });
  };
  return [load, loading];
}

export function useLoad<T>(loader: Loader<T>, deps: any[] = []) {
  const [load, loading] = useJustLoad();
  const [notYetStarted, setNotYetStarted] = useState(true);

  useEffect(() => {
    load(loader);
    setNotYetStarted(false);
  }, deps);

  return loading || notYetStarted;
}

export function useLoadMultiple(loaders: Loader<any>[]) {
  const loadings = loaders.map(loader => useLoad(loader));
  return loadings.every(loading => loading);
}

export type Pusher<T> = (
  post: PostRequest,
  dispatch: AppDispatch
) => Promise<T | null>;

interface PushOpts {
  noConnectionRetry?: boolean;
}

export function usePush() {
  const { get, post } = useContext(RequestContext);
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
          dispatchError(get, dispatch, err);
        }
      })
      .finally(() => {
        dispatch(loadingSlice.actions.subtractLoading());
      });
  };
  return push;
}
