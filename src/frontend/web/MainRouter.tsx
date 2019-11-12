import React from "react";
import { Switch, Route } from "react-router-dom";
import useCurrentUser from "./users/useCurrentUser";
import TranslateRoute from "./translate/TranslateRoute";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";

export default function MainRouter() {
  const [currentUser, logIn, logOut] = useCurrentUser();
  return (
    <div>
      <h1>This is Lessons from Luke</h1>
      <Switch>
        <Route path="/translate" render={() => <TranslateRoute />} />
        <Route
          render={() =>
            currentUser ? <AdminHome /> : <PublicHome logIn={logIn} />
          }
        />
      </Switch>
    </div>
  );
}
