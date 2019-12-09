import React from "react";
import { Switch, Route } from "react-router-dom";
import TranslateRoute from "./translate/TranslateRoute";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";
import { useSelector } from "react-redux";
import { AppState } from "../common/state/appState";
import { useLoad } from "../common/api/RequestContext";
import { loadCurrentUser } from "../common/state/currentUserSlice";
import Banners from "../common/banners/Banners";

export default function MainRouter() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);
  useLoad(loadCurrentUser);

  const appLoading = useSelector((state: AppState) => state.loading);

  return (
    <div>
      {appLoading > 0 && "Loading..."}
      <h1>This is Lessons from Luke</h1>
      <Banners />
      {loaded ? (
        <Switch>
          <Route path="/translate" render={() => <TranslateRoute />} />
          <Route render={() => (user ? <AdminHome /> : <PublicHome />)} />
        </Switch>
      ) : (
        "Loading..."
      )}
    </div>
  );
}
