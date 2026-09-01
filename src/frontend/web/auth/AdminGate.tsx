import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { AppState } from "../../common/state/appState";
import LoadingSnake from "../../common/base-components/LoadingSnake";

/**
 * AdminGate — React Router v6 layout route that enforces admin authorization
 * on all child routes. Nest it INSIDE AuthGate: AuthGate answers "signed in?",
 * AdminGate answers only "is this user an admin?".
 *
 * Decision matrix:
 *   - `loaded === false`               → render `<LoadingSnake />` (auth state
 *     not yet known; never redirect before we know). Defense-in-depth — the
 *     enclosing AuthGate normally absorbs this state first.
 *   - `loaded === true, !user?.admin`  → redirect to `/` with `replace` so no
 *     admin URL is left in the history stack. No returnTo is preserved:
 *     a non-admin can never "return to" an admin page, so redirect-home is
 *     terminal.
 *   - `loaded === true, user.admin`    → render `<Outlet />` (pass through to
 *     the child route).
 *
 * Place this component as the `element` of a wrapper `<Route>` nested under
 * the AuthGate wrapper in MainRouter, and nest all admin-only routes as its
 * children. Admin routes are registered unconditionally — authorization is
 * this gate's job, not conditional route registration.
 */
export default function AdminGate() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);

  if (!loaded) {
    return <LoadingSnake />;
  }

  if (!user?.admin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
