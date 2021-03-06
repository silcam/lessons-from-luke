import React, { useContext, useEffect, useState } from "react";
import { AppDispatch } from "../state/appState";
import { useDispatch } from "react-redux";
import {
  AppError,
  asAppError,
  AppErrorHandler
} from "../../../core/models/AppError";
import bannerSlice from "../banners/bannerSlice";
import loadingSlice from "./loadingSlice";
import {
  networkConnectionLostAction,
  useNetworkConnectionRestored
} from "../state/networkSlice";
import RequestContext, { GetRequest, PostRequest } from "./RequestContext";

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

export function useJustLoad(
  errorHandler: AppErrorHandler = () => false
): [(ldr: Loader<any>) => void, boolean] {
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
        if (!errorHandler(err)) {
          dispatchError(get, dispatch, err);
        }
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

export function useLoad<T>(
  loader: Loader<T>,
  deps: any[] = [],
  errorHandler: AppErrorHandler = () => false
) {
  const [load, loading] = useJustLoad(errorHandler);
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
