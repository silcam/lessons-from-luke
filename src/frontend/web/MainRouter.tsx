import React, { useEffect, useRef } from "react";
import { Routes, Route, useParams, useNavigate, useLocation } from "react-router-dom";
import TranslateRoute from "../common/translate/TranslateHome";
import AdminHome from "./home/AdminHome";
import PublicHome from "./home/PublicHome";
import SignedInHome from "./home/SignedInHome";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, AppState } from "../common/state/appState";
import { User } from "../../core/models/User";
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
import { safeReturnTo } from "./auth/safeReturnTo";
import DeviceLinkPage from "./deviceLink/DeviceLinkPage";
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
  const navigate = useNavigate();
  const location = useLocation();
  useClearBannersOnNavigation();

  // Track previous (loaded, user) to distinguish initial resolution from in-session login.
  const prevLoadedRef = useRef(loaded);
  const prevUserRef = useRef(user);

  useEffect(() => {
    dispatch(loadCurrentUser());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Post-login return-to navigation.
  // Trigger ONLY on the in-session login edge:
  //   prevLoaded===true (already resolved) AND prevUser===null AND user!==null.
  // The initial-resolution edge (prevLoaded===false → loaded becomes true) must NOT navigate.
  useEffect(() => {
    const prevLoaded = prevLoadedRef.current;
    const prevUser = prevUserRef.current;

    if (prevLoaded === true && prevUser === null && user !== null) {
      const params = new URLSearchParams(location.search);
      const returnTo = params.get("returnTo") ?? "";
      navigate(safeReturnTo(returnTo), { replace: true });
    }

    prevLoadedRef.current = loaded;
    prevUserRef.current = user;
  }, [loaded, user, location.search, navigate]);

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
          {user?.admin && <Route path="/admin/invitations/new" element={<CreateInvitation />} />}
          {user?.admin && <Route path="/admin/invitations" element={<InvitationsList />} />}
          {/* Device pairing approval — requires auth so the session is known when
              approving/denying (FR-002); unauthenticated visitors are redirected
              to sign-in with returnTo encoding the full path+search so the
              user_code survives the sign-in round-trip (US1.8). */}
          <Route path="/link" element={<DeviceLinkPage />} />
        </Route>
        {/* Public route — anyone with the token URL can redeem (FR-007, FR-011).
            MUST be outside AuthGate to prevent redirect loops. */}
        <Route path="/invitation/:token" element={<RedeemInvitationWrapper />} />
        {/* Public routes — self-service password reset (US1). Outside AuthGate:
            locked-out users must reach them without a session. */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Catch-all: outside AuthGate so the home/sign-in page is always reachable.
            renderHome routes logged-in non-admins to SignedInHome (FR fix from
            002-invitation-system), admins to AdminHome, anonymous to PublicHome. */}
        <Route path="*" element={renderHome(user)} />
      </Routes>
    </RootDiv>
  );
}
