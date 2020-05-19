import React from "react";
import { Switch, Route } from "react-router-dom";
import TranslateRoute from "../common/translate/TranslateHome";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";
import { useSelector } from "react-redux";
import { AppState } from "../common/state/appState";
import { useLoad } from "../common/api/useLoad";
import { loadCurrentUser } from "../common/state/currentUserSlice";
import RootDiv from "../common/base-components/RootDiv";
import LoadingSnake from "../common/base-components/LoadingSnake";
import LessonPage from "./lessons/LessonPage";
import AppLoadingBar from "../common/api/AppLoadingBar";
import UsfmImportResultPage from "./languages/UsfmImportResultPage";
import DocStringsPage from "./lessons/DocStringsPage";
import MigrateProjectsIndex from "./migrate/MigrateProjectsIndex";
import MigrateProject from "./migrate/MigrateProject";

export default function MainRouter() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);
  useLoad(loadCurrentUser);

  return (
    <RootDiv>
      <AppLoadingBar />
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
          <Route
            path="/usfmImportResult"
            render={() => <UsfmImportResultPage />}
          />
          <Route
            path="/languages/:languageId/lessons/:lessonId/docStrings"
            render={({ match }) => (
              <DocStringsPage
                languageId={parseInt(match.params.languageId)}
                lessonId={parseInt(match.params.lessonId)}
              />
            )}
          />
          <Route
            path="/migrate/:datetime/to/:languageId"
            render={({ match }) => (
              <MigrateProject
                datetime={parseInt(match.params.datetime)}
                languageId={parseInt(match.params.languageId)}
              />
            )}
          />
          <Route path="/migrate" render={() => <MigrateProjectsIndex />} />
          <Route render={() => (user ? <AdminHome /> : <PublicHome />)} />
        </Switch>
      ) : (
        <LoadingSnake />
      )}
    </RootDiv>
  );
}
