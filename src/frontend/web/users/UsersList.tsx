/**
 * UsersList.tsx — Admin account roster screen
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §US2, §FR-001,
 *       §FR-002, §FR-005..FR-008, §FR-011, §Acceptance Scenarios 1-3, 5
 * Plan: plan.md §Presentation Design §UI Decisions (UsersList component,
 *       Deactivate/Reactivate row action), plan.md §Accessibility
 *       Requirements ("Guardrail-disabled actions must convey why,
 *       accessibly", "Focus management across row-state changes", "Status
 *       and role must not rely on color alone")
 * Reference: mirrors the invitation "Retract" two-step inline confirm
 *       pattern in src/frontend/web/invitations/InvitationsList.tsx
 *
 * Renders:
 *   - Loading indicator while fetching; a distinct error state with retry
 *     (a failed fetch must not read as "no users")
 *   - Kit Table of all accounts: Name, Email, Role, Status, Created, Actions
 *   - Own row marked "You"; status shown as a text label (WCAG 1.4.1), not
 *     color-only
 *   - Empty state when no accounts exist
 *   - Deactivate/Reactivate row action (US2):
 *       - Deactivate requires an inline two-step confirm (mirrors
 *         Invitations Retract)
 *       - Deactivate is disabled — with an accessible reason (NOT
 *         disabled-attribute-only) — on the operator's own row and on the
 *         last remaining active admin row
 *       - Reactivate is a single click; it always shows inline helptext
 *         warning that reactivation restores the SAME credential, so it is
 *         only appropriate for a returning user, not for recovering a
 *         compromised account
 *       - After a confirm resolves or is cancelled, focus moves
 *         deterministically to the row's resulting action button — never
 *         dropped to <body>
 *       - A role="status"/aria-live region announces the mutation outcome
 */

import React, { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import { listUsers, deactivateAccount, reactivateAccount, UserAccountRow } from "./usersListThunks";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Div from "../../common/base-components/Div";
import Button from "../../common/base-components/Button";
import Table from "../../common/base-components/Table";
import Alert from "../../common/base-components/Alert";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import HelpText from "../../common/base-components/HelpText";
import useTranslation from "../../common/util/useTranslation";

// The DOM id shared by whichever button currently occupies a row's primary
// Deactivate/Reactivate action slot. Kept stable across the Deactivate ->
// Reactivate swap (and back) so focus can be restored deterministically
// after a confirm resolves or is cancelled, per plan.md's focus-management
// requirement.
const rowActionId = (id: string): string => `user-row-action-${id}`;
const reasonId = (id: string): string => `user-deactivate-reason-${id}`;

export default function UsersList() {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());

  const [users, setUsers] = useState<UserAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<{ text: string; error?: boolean } | null>(null);
  const pendingFocusId = useRef<string | null>(null);

  // No synchronous setState here — `loading` already initializes to true, so the
  // mount effect can call this directly without triggering cascading renders.
  const load = async () => {
    const action = await dispatch(listUsers());
    if ((action as { error?: unknown }).error) {
      // Distinct from empty: a failed fetch must not masquerade as "no users".
      setLoadError(true);
    } else {
      setUsers((action as { payload: UserAccountRow[] }).payload);
    }
    setLoading(false);
  };

  // Retry from the error state: reset to the loading view, then refetch.
  const reload = () => {
    setLoading(true);
    setLoadError(false);
    void load();
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the row's primary action button after a confirm resolves
  // or is cancelled (the element may have just mounted, so defer to after
  // the DOM has committed the new render).
  useEffect(() => {
    if (pendingFocusId.current) {
      const id = pendingFocusId.current;
      pendingFocusId.current = null;
      document.getElementById(id)?.focus();
    }
  });

  const formatRole = (role: string): string => {
    if (role === "admin") return t("Invitation_role_admin");
    return t("Invitation_role_standard");
  };

  const formatStatus = (status: string): string => {
    if (status === "deactivated") return t("Users_status_deactivated");
    return t("Users_status_active");
  };

  const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();

  const activeAdminCount = users.filter(
    (user) => user.role === "admin" && user.status === "active"
  ).length;

  const isLastActiveAdmin = (user: UserAccountRow): boolean =>
    user.role === "admin" && user.status === "active" && activeAdminCount <= 1;

  const handleDeactivate = async (id: string) => {
    const action = await dispatch(deactivateAccount(id));
    if ((action as { error?: unknown }).error) {
      const rejected = action as { payload?: { message: string } };
      setAnnouncement({
        text: rejected.payload?.message ?? t("Users_load_error"),
        error: true,
      });
    } else {
      const updated = (action as { payload: UserAccountRow }).payload;
      setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
      setAnnouncement({ text: `${updated.name}: ${t("Users_status_deactivated")}` });
    }
    setConfirmDeactivateId(null);
    pendingFocusId.current = rowActionId(id);
  };

  const handleReactivate = async (id: string) => {
    const action = await dispatch(reactivateAccount(id));
    if ((action as { error?: unknown }).error) {
      const rejected = action as { payload?: { message: string } };
      setAnnouncement({
        text: rejected.payload?.message ?? t("Users_load_error"),
        error: true,
      });
    } else {
      const updated = (action as { payload: UserAccountRow }).payload;
      setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
      setAnnouncement({ text: `${updated.name}: ${t("Users_status_active")}` });
    }
    pendingFocusId.current = rowActionId(id);
  };

  const handleCancelDeactivate = (id: string) => {
    setConfirmDeactivateId(null);
    pendingFocusId.current = rowActionId(id);
  };

  const renderRowAction = (user: UserAccountRow) => {
    if (user.status === "deactivated") {
      return (
        <div>
          <Button
            id={rowActionId(user.id)}
            text={t("Users_action_reactivate")}
            onClick={() => void handleReactivate(user.id)}
          />
          <HelpText>{t("Users_reactivate_credential_help")}</HelpText>
        </div>
      );
    }

    // Guardrails apply only to Deactivate: an admin cannot deactivate their
    // own account, and the last remaining active admin cannot be
    // deactivated by anyone. Convey the reason accessibly — not via the
    // disabled attribute alone (many screen readers skip a bare disabled
    // control silently).
    let guardrailReason: string | null = null;
    if (user.isSelf) {
      guardrailReason = t("Users_guardrail_self_deactivate");
    } else if (isLastActiveAdmin(user)) {
      guardrailReason = t("Users_guardrail_last_admin_deactivate");
    }

    if (guardrailReason) {
      return (
        <div>
          <Button
            id={rowActionId(user.id)}
            red
            text={t("Users_action_deactivate")}
            disabled
            aria-describedby={reasonId(user.id)}
            onClick={() => {}}
          />
          <HelpText>
            <span id={reasonId(user.id)}>{guardrailReason}</span>
          </HelpText>
        </div>
      );
    }

    if (confirmDeactivateId === user.id) {
      return (
        <div role="group" aria-label={t("Users_action_deactivate")}>
          <HelpText>{t("Users_deactivate_confirm_prompt")}</HelpText>
          <div>
            <Button
              id={`user-deactivate-confirm-${user.id}`}
              red
              text={t("Users_action_deactivate_confirm")}
              onClick={() => void handleDeactivate(user.id)}
            />
            <Button link text={t("Cancel")} onClick={() => handleCancelDeactivate(user.id)} />
          </div>
        </div>
      );
    }

    return (
      <Button
        id={rowActionId(user.id)}
        red
        text={t("Users_action_deactivate")}
        onClick={() => setConfirmDeactivateId(user.id)}
      />
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <>
          <LoadingSnake />
          <HelpText>{t("Users_loading")}</HelpText>
        </>
      );
    }

    if (loadError) {
      return (
        <>
          <div role="alert">
            <Alert danger>{t("Users_load_error")}</Alert>
          </div>
          <Button text={t("TryAgain")} onClick={reload} />
        </>
      );
    }

    if (users.length === 0) {
      return <p>{t("Users_empty_state")}</p>;
    }

    return (
      <Table
        header={
          <tr>
            <th>{t("Users_column_name")}</th>
            <th>{t("Users_column_email")}</th>
            <th>{t("Users_column_role")}</th>
            <th>{t("Users_column_status")}</th>
            <th>{t("Users_column_created")}</th>
            <th>{t("Users_column_actions")}</th>
          </tr>
        }
      >
        {users.map((user) => (
          <tr key={user.id}>
            <td>
              {user.name}
              {user.isSelf ? ` (${t("Users_self_marker")})` : ""}
            </td>
            <td>{user.email}</td>
            <td>{formatRole(user.role)}</td>
            <td>{formatStatus(user.status)}</td>
            <td>{formatDate(user.createdAt)}</td>
            <td>{renderRowAction(user)}</td>
          </tr>
        ))}
      </Table>
    );
  };

  return (
    <StdHeaderBarPage
      title={t("Users_page_heading")}
      renderRight={() => <Button text={t("Log_out")} onClick={logOut} />}
    >
      <Div pad>
        {/* Accessible + visible mutation-outcome announcement */}
        <div role="status" aria-live="polite">
          {announcement ? (
            announcement.error ? (
              <Alert danger>{announcement.text}</Alert>
            ) : (
              <Alert success>{announcement.text}</Alert>
            )
          ) : (
            ""
          )}
        </div>

        {renderBody()}
      </Div>
    </StdHeaderBarPage>
  );
}
