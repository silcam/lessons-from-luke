import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { AppState } from "../../common/state/appState";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import { isWebAuthEnforced } from "./webAuthEnforcement";

/**
 * AuthGate — React Router v6 layout route that enforces sign-in on all child
 * routes.
 *
 * Decision matrix:
 *   - `ENFORCE_WEB_AUTH` disabled (server-injected `<meta name="enforce-web-auth"
 *     content="0">`) → render `<Outlet />` immediately, with no loading state and
 *     no redirect. Checked first so disabling the flag produces no loading flash.
 *   - `loaded === false`              → render `<LoadingSnake />` (auth state
 *     not yet known; never redirect before we know).
 *   - `loaded === true, user === null` → redirect to `/login?returnTo=<encoded path>`
 *     with `replace` so the history stack stays clean.
 *   - `loaded === true, user !== null` → render `<Outlet />` (pass through to
 *     the child route).
 *
 * Place this component as the `element` of a wrapper `<Route>` in MainRouter
 * and nest all protected routes as its children. Keep public routes (e.g.
 * `/invitation/:token`) and the catch-all `*` OUTSIDE this wrapper to prevent
 * redirect loops.
 */
export default function AuthGate() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);
  const location = useLocation();

  if (!isWebAuthEnforced()) {
    return <Outlet />;
  }

  if (!loaded) {
    return <LoadingSnake />;
  }

  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <Outlet />;
}
