import React from "react";
import { Routes, Route, useParams } from "react-router-dom";
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
import UpdateIssuesPage from "./lessons/UpdateIssuesPage";

function TranslateRouteWrapper() {
  const { code } = useParams<{ code: string }>();
  return <TranslateRoute code={code!} />;
}

function LessonPageWrapper() {
  const { id } = useParams<{ id: string }>();
  return <LessonPage id={parseInt(id!)} />;
}

function DocStringsPageWrapper() {
  const { languageId, lessonId } = useParams<{
    languageId: string;
    lessonId: string;
  }>();
  return (
    <DocStringsPage
      languageId={parseInt(languageId!)}
      lessonId={parseInt(lessonId!)}
    />
  );
}

function MigrateProjectWrapper() {
  const { datetime, languageId } = useParams<{
    datetime: string;
    languageId: string;
  }>();
  return (
    <MigrateProject
      datetime={parseInt(datetime!)}
      languageId={parseInt(languageId!)}
    />
  );
}

function UpdateIssuesPageWrapper() {
  const { lessonId } = useParams<{ lessonId: string }>();
  return <UpdateIssuesPage lessonId={parseInt(lessonId!)} />;
}

export default function MainRouter() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);
  useLoad(loadCurrentUser);

  return (
    <RootDiv>
      <AppLoadingBar />
      {loaded ? (
        <Routes>
          <Route path="/translate/:code" element={<TranslateRouteWrapper />} />
          <Route path="/lessons/:id" element={<LessonPageWrapper />} />
          <Route path="/usfmImportResult" element={<UsfmImportResultPage />} />
          <Route
            path="/languages/:languageId/lessons/:lessonId/docStrings"
            element={<DocStringsPageWrapper />}
          />
          <Route
            path="/migrate/:datetime/to/:languageId"
            element={<MigrateProjectWrapper />}
          />
          <Route path="/migrate" element={<MigrateProjectsIndex />} />
          <Route
            path="/update-issues/:lessonId"
            element={<UpdateIssuesPageWrapper />}
          />
          <Route path="*" element={user ? <AdminHome /> : <PublicHome />} />
        </Routes>
      ) : (
        <LoadingSnake />
      )}
    </RootDiv>
  );
}
