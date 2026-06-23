import React, { useEffect } from "react";
import { Routes, Route, useParams } from "react-router-dom";
import TranslateRoute from "../common/translate/TranslateHome";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, AppState } from "../common/state/appState";
import { loadCurrentUser } from "./auth/authThunks";
import RootDiv from "../common/base-components/RootDiv";
import LessonPage from "./lessons/LessonPage";
import AppLoadingBar from "../common/api/AppLoadingBar";
import UsfmImportResultPage from "./languages/UsfmImportResultPage";
import DocStringsPage from "./lessons/DocStringsPage";
import UpdateIssuesPage from "./lessons/UpdateIssuesPage";
import { useClearBannersOnNavigation } from "../common/banners/useClearBannersOnNavigation";
import CreateInvitation from "./invitations/CreateInvitation";
import InvitationsList from "./invitations/InvitationsList";
import RedeemInvitation from "./auth/RedeemInvitation";
import AuthGate from "./auth/AuthGate";

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
  return <DocStringsPage languageId={parseInt(languageId!)} lessonId={parseInt(lessonId!)} />;
}

function UpdateIssuesPageWrapper() {
  const { lessonId } = useParams<{ lessonId: string }>();
  return <UpdateIssuesPage lessonId={parseInt(lessonId!)} />;
}

function RedeemInvitationWrapper() {
  const { token } = useParams<{ token: string }>();
  return <RedeemInvitation token={token!} />;
}

export default function MainRouter() {
  const { user } = useSelector((state: AppState) => state.currentUser);
  const dispatch = useDispatch<AppDispatch>();
  useClearBannersOnNavigation();

  useEffect(() => {
    dispatch(loadCurrentUser());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RootDiv>
      <AppLoadingBar />
      <Routes>
        {/* AuthGate wraps all named content routes — unauthenticated visitors
            are redirected to /?returnTo=<path> before seeing any content. */}
        <Route element={<AuthGate />}>
          <Route path="/translate/:code" element={<TranslateRouteWrapper />} />
          <Route path="/lessons/:id" element={<LessonPageWrapper />} />
          <Route path="/usfmImportResult" element={<UsfmImportResultPage />} />
          <Route
            path="/languages/:languageId/lessons/:lessonId/docStrings"
            element={<DocStringsPageWrapper />}
          />
          <Route path="/update-issues/:lessonId" element={<UpdateIssuesPageWrapper />} />
          {user?.admin && (
            <Route path="/admin/invitations/new" element={<CreateInvitation />} />
          )}
          {user?.admin && (
            <Route path="/admin/invitations" element={<InvitationsList />} />
          )}
        </Route>
        {/* Public route — anyone with the token URL can redeem (FR-007, FR-011).
            MUST be outside AuthGate to prevent redirect loops. */}
        <Route path="/invitation/:token" element={<RedeemInvitationWrapper />} />
        {/* Catch-all: outside AuthGate so the home/sign-in page is always reachable. */}
        <Route path="*" element={user ? <AdminHome /> : <PublicHome />} />
      </Routes>
    </RootDiv>
  );
}
