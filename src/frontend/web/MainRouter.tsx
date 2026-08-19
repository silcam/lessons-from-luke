import React, { useEffect } from "react";
import { Routes, Route, useParams, Navigate } from "react-router-dom";
import TranslateRoute from "../common/translate/TranslateHome";
import AdminHome from "./home/AdminHome";
import LoginPage from "./auth/LoginPage";
import SignedInHome from "./home/SignedInHome";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, AppState } from "../common/state/appState";
import { loadCurrentUser, pushLogout } from "./auth/authThunks";
import useTranslation from "../common/util/useTranslation";
import Button from "../common/base-components/Button";
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
import AdminGate from "./auth/AdminGate";
import ForgotPassword from "./auth/ForgotPassword";
import ResetPassword from "./auth/ResetPassword";

function TranslateRouteWrapper() {
  const { code } = useParams<{ code: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const t = useTranslation();
  const logOut = () => dispatch(pushLogout());
  return (
    <TranslateRoute
      code={code!}
      renderHeaderExtra={() => <Button text={t("Log_out")} onClick={logOut} />}
    />
  );
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

function GatedHome() {
  // AuthGate guarantees `user` is non-null past this point.
  const user = useSelector((state: AppState) => state.currentUser.user);
  if (!user) return null;
  return user.admin ? <AdminHome /> : <SignedInHome />;
}

export default function MainRouter() {
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
            are redirected to /login?returnTo=<path> before seeing any content. */}
        <Route element={<AuthGate />}>
          <Route path="/" element={<GatedHome />} />
          <Route path="/translate/:code" element={<TranslateRouteWrapper />} />
          <Route path="/lessons/:id" element={<LessonPageWrapper />} />
          <Route path="/usfmImportResult" element={<UsfmImportResultPage />} />
          <Route
            path="/languages/:languageId/lessons/:lessonId/docStrings"
            element={<DocStringsPageWrapper />}
          />
          <Route path="/update-issues/:lessonId" element={<UpdateIssuesPageWrapper />} />
          {/* Admin-only routes — registered unconditionally so deep-links resolve
              during initial auth load; AdminGate owns the authorization decision. */}
          <Route element={<AdminGate />}>
            <Route path="/admin/invitations/new" element={<CreateInvitation />} />
            <Route path="/admin/invitations" element={<InvitationsList />} />
            <Route path="/languages/:languageId" element={<AdminHome />} />
          </Route>
        </Route>
        {/* Public route — the sign-in form. Outside AuthGate so it's always
            reachable; AuthGate redirects unauthenticated visitors here. */}
        <Route path="/login" element={<LoginPage />} />
        {/* Public route — anyone with the token URL can redeem (FR-007, FR-011).
            MUST be outside AuthGate to prevent redirect loops. */}
        <Route path="/invitation/:token" element={<RedeemInvitationWrapper />} />
        {/* Public routes — self-service password reset (US1). Outside AuthGate:
            locked-out users must reach them without a session. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Catch-all: send unknown paths home, where AuthGate applies. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RootDiv>
  );
}
