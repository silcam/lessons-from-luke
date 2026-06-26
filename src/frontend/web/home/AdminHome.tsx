/**
 * AdminHome.tsx — Admin home page
 *
 * Spec: specs/004-desktop-auth-pairing/spec.md §FR-017
 * Plan: specs/004-desktop-auth-pairing/plan.md §Project Structure
 *       (frontend/web/home/AdminHome.tsx), §Presentation Design (UI Decisions:
 *       Web admin Revoke device access), §Accessibility Requirements
 *
 * Renders:
 *   - Header bar with Invitations link + Log Out button
 *   - LanguagesBox and LessonsBox (existing)
 *   - Users section: list all users with a destructive "Revoke device access"
 *     button per row. Click opens an accessible confirm dialog (native <dialog>
 *     with showModal for focus trapping). On confirm: POST revoke-sessions.
 *     Success / error announced via aria-live region.
 */

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { AppDispatch, AppState } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import useTranslation from "../../common/util/useTranslation";
import LanguagesBox from "../languages/LanguagesBox";
import LessonsBox from "../lessons/LessonsBox";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { FlexRow } from "../../common/base-components/Flex";
import Button from "../../common/base-components/Button";
import Alert from "../../common/base-components/Alert";
import HelpText from "../../common/base-components/HelpText";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import Div from "../../common/base-components/Div";
import Colors from "../../common/util/Colors";
import { listAdminUsers, revokeUserDeviceAccess, type AdminUserRow } from "./adminUsersThunks";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const SectionHeading = styled.h2`
  font-size: 1.1em;
  font-weight: 600;
  margin: 1em 0 0.5em;
`;

interface UserRowProps {
  children?: React.ReactNode;
}

const SUserRow = styled.div<UserRowProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5em 0;
  border-bottom: 1px solid ${Colors.lightGrey};
`;

const UserInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const UserEmail = styled.span`
  font-size: 0.9em;
  color: ${Colors.grey};
`;

// Inline styles for the native <dialog> element.
// We can't use a styled-component here because styled() doesn't forward refs
// (which showModal() requires), and React.forwardRef would add boilerplate.
// Using React's own HTMLDialogElement ref + inline styles is the simplest path.
const dialogStyle: React.CSSProperties = {
  border: `1px solid ${Colors.lightGrey}`,
  borderRadius: "0.25em",
  padding: "1.5em",
  maxWidth: "30em",
  background: "white",
};

const DialogActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
  margin-top: 1em;
`;

// ---------------------------------------------------------------------------
// AdminHome
// ---------------------------------------------------------------------------

export default function AdminHome() {
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());
  const t = useTranslation();
  const user = useSelector((s: AppState) => s.currentUser.user);

  // ------------------------------------------------------------------
  // Users state
  // ------------------------------------------------------------------
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersLoadError, setUsersLoadError] = useState(false);

  // ------------------------------------------------------------------
  // Revoke dialog state
  // ------------------------------------------------------------------
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Stores button DOM elements by userId for focus restoration on dialog close.
  const triggerButtons = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Announcement message for the aria-live region
  const [announcement, setAnnouncement] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // ------------------------------------------------------------------
  // Load users
  // ------------------------------------------------------------------
  // `load` contains only post-await setState calls (avoids react-hooks/set-state-in-effect).
  // `usersLoading` initialises to true so the first render shows the loading skeleton.
  const load = async () => {
    const action = await dispatch(listAdminUsers());
    if ((action as { error?: unknown }).error) {
      setUsersLoadError(true);
    } else {
      setUsers((action as { payload: AdminUserRow[] }).payload);
    }
    setUsersLoading(false);
  };

  // Retry from the error state: synchronous setState is safe here because
  // `reload` is only called from a button click handler, never inside
  // a useEffect body — so there is no cascading-render risk.
  const reload = () => {
    setUsersLoading(true);
    setUsersLoadError(false);
    void load();
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Dialog open / close
  // ------------------------------------------------------------------
  const openDialog = (targetUser: AdminUserRow) => {
    setConfirmUser(targetUser);
    // showModal() activates focus trapping; Escape closes the dialog natively
    // and fires the onCancel event (handled by closeDialog).
    dialogRef.current?.showModal();
  };

  const closeDialog = () => {
    dialogRef.current?.close();
    // Restore focus to the trigger button before clearing confirmUser so we
    // still know which button to focus.
    if (confirmUser) {
      triggerButtons.current.get(confirmUser.id)?.focus();
    }
    setConfirmUser(null);
  };

  // ------------------------------------------------------------------
  // Revoke confirm
  // ------------------------------------------------------------------
  const handleRevoke = async () => {
    if (!confirmUser) return;
    const userId = confirmUser.id;

    closeDialog();

    const action = await dispatch(revokeUserDeviceAccess(userId));
    if ((action as { error?: unknown }).error) {
      setAnnouncement({ type: "error", message: t("AdminHome_revoke_error") });
    } else {
      const { revokedCount } = (action as { payload: { userId: string; revokedCount: number } })
        .payload;
      setAnnouncement({
        type: "success",
        message: t("AdminHome_revoke_success", { count: String(revokedCount) }),
      });
    }
  };

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------
  const renderUsersBody = () => {
    if (usersLoading) {
      return (
        <>
          <LoadingSnake />
          <HelpText>{t("AdminHome_users_loading")}</HelpText>
        </>
      );
    }

    if (usersLoadError) {
      return (
        <>
          <div role="alert">
            <Alert danger>{t("AdminHome_users_load_error")}</Alert>
          </div>
          <Button text={t("TryAgain")} onClick={reload} />
        </>
      );
    }

    return (
      <>
        {users.map((u) => (
          <SUserRow key={u.id}>
            <UserInfo>
              <span>{u.name}</span>
              <UserEmail>{u.email}</UserEmail>
            </UserInfo>
            {/* Wrapper span captures the inner button element for focus restoration. */}
            <span
              ref={(el) => {
                const btn = el?.querySelector("button") as HTMLButtonElement | null;
                triggerButtons.current.set(u.id, btn);
              }}
            >
              <Button
                red
                text={t("AdminHome_revoke_device_access")}
                onClick={() => openDialog(u)}
              />
            </span>
          </SUserRow>
        ))}
      </>
    );
  };

  return (
    <>
      <StdHeaderBarPage
        title={t("Home")}
        renderRight={() => (
          <FlexRow>
            {user?.admin && (
              <Link to="/admin/invitations">
                <Button text={t("Invitations_page_heading")} onClick={() => {}} />
              </Link>
            )}
            <Button text={t("Log_out")} onClick={logOut} />
          </FlexRow>
        )}
      >
        <LanguagesBox />
        <LessonsBox />

        {/* Users section — admin revoke device access (US4.4) */}
        <Div pad>
          {/* aria-live region: announces success/error outcomes to screen readers */}
          <div role="status" aria-live="polite" aria-atomic="true">
            {announcement?.type === "success" && (
              <Alert success>{announcement.message}</Alert>
            )}
            {announcement?.type === "error" && (
              <Alert danger>{announcement.message}</Alert>
            )}
          </div>

          <SectionHeading>{t("AdminHome_users_heading")}</SectionHeading>
          {renderUsersBody()}
        </Div>
      </StdHeaderBarPage>

      {/* Accessible confirm dialog — rendered outside StdHeaderBarPage so it can
          use showModal() and sit on top of the page as a true modal. The native
          <dialog> element provides focus trapping, Escape-to-close, and
          backdrop rendering. Inline styles are used because styled-components
          does not forward refs, which showModal() requires. */}
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-dialog-title"
        onCancel={closeDialog}
        style={dialogStyle}
      >
        <p id="revoke-dialog-title">
          {confirmUser
            ? t("AdminHome_revoke_confirm_prompt", { name: confirmUser.name })
            : ""}
        </p>
        <DialogActions>
          <Button
            red
            text={t("AdminHome_revoke_confirm_button")}
            onClick={() => void handleRevoke()}
          />
          <Button link text={t("Cancel")} onClick={closeDialog} />
        </DialogActions>
      </dialog>
    </>
  );
}
