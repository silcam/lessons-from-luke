import React, { useEffect } from "react";
import { Routes, Route, useParams } from "react-router-dom";
import TranslateRoute from "../common/translate/TranslateHome";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";
import SignedInHome from "./home/SignedInHome";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, AppState } from "../common/state/appState";
import { User } from "../../core/models/User";
import { loadCurrentUser } from "./auth/authThunks";
import RootDiv from "../common/base-components/RootDiv";
import LoadingSnake from "../common/base-components/LoadingSnake";
import LessonPage from "./lessons/LessonPage";
import AppLoadingBar from "../common/api/AppLoadingBar";
import UsfmImportResultPage from "./languages/UsfmImportResultPage";
import DocStringsPage from "./lessons/DocStringsPage";
import UpdateIssuesPage from "./lessons/UpdateIssuesPage";
import { useClearBannersOnNavigation } from "../common/banners/useClearBannersOnNavigation";
import CreateInvitation from "./invitations/CreateInvitation";
import InvitationsList from "./invitations/InvitationsList";
import RedeemInvitation from "./auth/RedeemInvitation";
import ForgotPassword from "./auth/ForgotPassword";
import ResetPassword from "./auth/ResetPassword";

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

function renderHome(user: User | null) {
  if (!user) return <PublicHome />;
  if (user.admin) return <AdminHome />;
  // Logged-in non-admins get an interim placeholder (see SignedInHome).
  return <SignedInHome />;
}

export default function MainRouter() {
  const { user, loaded } = useSelector((state: AppState) => state.currentUser);
  const dispatch = useDispatch<AppDispatch>();
  useClearBannersOnNavigation();

  useEffect(() => {
    dispatch(loadCurrentUser());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <Route path="/update-issues/:lessonId" element={<UpdateIssuesPageWrapper />} />
          {/* Public route — anyone with the token URL can redeem (FR-007, FR-011) */}
          <Route path="/invitation/:token" element={<RedeemInvitationWrapper />} />
          {/* Public routes — self-service password reset (US1) */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {user?.admin && <Route path="/admin/invitations/new" element={<CreateInvitation />} />}
          {user?.admin && <Route path="/admin/invitations" element={<InvitationsList />} />}
          <Route path="*" element={renderHome(user)} />
        </Routes>
      ) : (
        <LoadingSnake />
      )}
    </RootDiv>
  );
}
