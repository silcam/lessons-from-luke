import React from "react";
import { Switch, Route } from "react-router-dom";
import TranslateRoute from "../common/translate/TranslateHome";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";
import { useSelector } from "react-redux";
import { AppState } from "../common/state/appState";
import { useLoad } from "../common/api/RequestContext";
import { loadCurrentUser } from "../common/state/currentUserSlice";
import RootDiv from "../common/base-components/RootDiv";
import LoadingSnake from "../common/base-components/LoadingSnake";
import LessonPage from "./lessons/LessonPage";

export default function MainRouter() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);
  useLoad(loadCurrentUser);

  return (
    <RootDiv>
      {loaded ? (
        <Switch>
          <Route
            path="/translate/:code"
            render={({ match }) => <TranslateRoute code={match.params.code} />}
          />
          <Route
            path="/lessons/:id"
            render={({ match }) => (
              <LessonPage id={parseInt(match.params.id)} />
            )}
          />
          <Route render={() => (user ? <AdminHome /> : <PublicHome />)} />
        </Switch>
      ) : (
        <LoadingSnake />
      )}
    </RootDiv>
  );
}
