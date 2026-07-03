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
 *   - Promote/Demote row action (US3):
 *       - Promote (Standard -> Admin) is a single click — non-destructive,
 *         no confirm needed
 *       - Demote (Admin -> Standard) requires an inline two-step confirm
 *         (same mechanics as Deactivate)
 *       - Demote is disabled — with an accessible reason — on the last
 *         remaining active admin row (self-demotion has no separate guard:
 *         it is permitted while another active admin remains)
 *       - The SELF row's demote confirm uses a distinct warning copy
 *         ("you will immediately lose administrator access") — a role
 *         change takes effect on the account's very next request, so a
 *         successful self-demotion navigates the operator to the non-admin
 *         home instead of re-fetching the roster into a 403/error state
 *         (plan.md §Edge Cases, "Self-demotion evicts the acting admin")
 *   - Force sign-out row action (US4):
 *       - Always available (not guarded by last-admin/self rules) — an
 *         inline two-step confirm (same mechanics as Deactivate/Demote)
 *       - Never disabled on the self row (force-signing yourself out — i.e.
 *         signing out all devices — is a legitimate action)
 *       - Account status stays Active; a successful non-self force-sign-out
 *         announces the outcome via the role="status"/aria-live region
 *       - The SELF row's confirm uses a distinct warning copy that names the
 *         real scope of the action — EVERY device, not just the one in
 *         use — since `revokeSessions` deletes all of the target's sessions
 *       - A successful SELF-targeted force-sign-out clears the local
 *         session and redirects to the sign-in screen instead of
 *         re-fetching the roster into a 401/error state (plan.md §Edge
 *         Cases, "Force-sign-out on one's own row evicts the acting admin")
 */

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import currentUserSlice from "../../common/state/currentUserSlice";
import {
  listUsers,
  deactivateAccount,
  reactivateAccount,
  changeRole,
  revokeSessions,
  UserAccountRow,
} from "./usersListThunks";
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

// Same idea as rowActionId/reasonId, but for the independent Promote/Demote
// action slot — kept distinct so the two row actions' focus-restoration
// never collide on the same DOM id.
const roleActionId = (id: string): string => `user-role-action-${id}`;
const roleReasonId = (id: string): string => `user-demote-reason-${id}`;

// Same idea again, for the independent Force sign-out action slot (US4).
const forceSignOutActionId = (id: string): string => `user-force-sign-out-action-${id}`;

// Mirrors InvitationsList's ActionGroup: keeps a row action's confirm/cancel
// button pair grouped with consistent spacing and graceful wrapping, rather
// than relying on incidental Button margins.
const ActionGroup = styled.div<{ children?: React.ReactNode }>`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em;
  align-items: center;
`;

// Groups a row's three independent action slots (role change,
// deactivate/reactivate, force sign-out) with consistent vertical spacing.
// They are separate controls, not one action group, so this stacks rather
// than mirroring ActionGroup's row layout.
const ActionStack = styled.div<{ children?: React.ReactNode }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5em;
`;

// Wraps the roster table so only the table region scrolls horizontally on
// narrow viewports (5 data columns + a 3-action column is wide) — the rest
// of the page (heading, live-region alert, help text) still reflows to full
// width instead of the whole page requiring two-dimensional scrolling.
// `tabIndex`/`role`/`aria-label` make the scrollable region keyboard-
// reachable: most of the table's cells hold plain text, not focusable
// controls, so a keyboard-only user would otherwise have no way to scroll a
// clipped row into view.
const TableScroll = styled.div<{
  children?: React.ReactNode;
  role?: string;
  "aria-label"?: string;
  tabIndex?: number;
}>`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

export default function UsersList() {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const logOut = () => dispatch(pushLogout());

  const [users, setUsers] = useState<UserAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [confirmDemoteId, setConfirmDemoteId] = useState<string | null>(null);
  const [confirmForceSignOutId, setConfirmForceSignOutId] = useState<string | null>(null);
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

  const handlePromote = async (id: string) => {
    const action = await dispatch(changeRole({ id, role: "admin" }));
    if ((action as { error?: unknown }).error) {
      const rejected = action as { payload?: { message: string } };
      setAnnouncement({
        text: rejected.payload?.message ?? t("Users_load_error"),
        error: true,
      });
    } else {
      const updated = (action as { payload: UserAccountRow }).payload;
      setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
      setAnnouncement({ text: `${updated.name}: ${formatRole(updated.role)}` });
    }
    pendingFocusId.current = roleActionId(id);
  };

  const handleDemote = async (id: string) => {
    const action = await dispatch(changeRole({ id, role: "standard" }));
    if ((action as { error?: unknown }).error) {
      const rejected = action as { payload?: { message: string } };
      setAnnouncement({
        text: rejected.payload?.message ?? t("Users_load_error"),
        error: true,
      });
      setConfirmDemoteId(null);
      pendingFocusId.current = roleActionId(id);
      return;
    }

    const updated = (action as { payload: UserAccountRow }).payload;

    // Self-demotion evicts the acting admin (plan.md §Edge Cases): the role
    // change takes effect on this account's very next request, so the next
    // /api/admin/* call would 403. Update the cached currentUser so
    // MainRouter/AdminHome stop treating this session as admin, then
    // navigate away instead of re-fetching the roster into an error state.
    if (updated.isSelf && updated.role === "standard") {
      dispatch(currentUserSlice.actions.setUser({ id: updated.id, admin: false }));
      navigate("/");
      return;
    }

    setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
    setAnnouncement({ text: `${updated.name}: ${formatRole(updated.role)}` });
    setConfirmDemoteId(null);
    pendingFocusId.current = roleActionId(id);
  };

  const handleCancelDemote = (id: string) => {
    setConfirmDemoteId(null);
    pendingFocusId.current = roleActionId(id);
  };

  const handleForceSignOut = async (id: string) => {
    const action = await dispatch(revokeSessions(id));
    if ((action as { error?: unknown }).error) {
      const rejected = action as { payload?: { message: string } };
      setAnnouncement({
        text: rejected.payload?.message ?? t("Users_load_error"),
        error: true,
      });
      setConfirmForceSignOutId(null);
      pendingFocusId.current = forceSignOutActionId(id);
      return;
    }

    const updated = (action as { payload: UserAccountRow & { revoked: number } }).payload;

    // Force-signing out one's own row revokes the acting admin's own session
    // (plan.md §Edge Cases, "Force-sign-out on one's own row evicts the
    // acting admin"): clear the local session and redirect to the sign-in
    // screen instead of re-fetching the roster into a 401/error state.
    if (updated.isSelf) {
      dispatch(currentUserSlice.actions.setUser(null));
      navigate("/");
      return;
    }

    setUsers((prev) => prev.map((user) => (user.id === id ? updated : user)));
    setAnnouncement({
      text: t("Users_force_sign_out_success", {
        name: updated.name,
        count: String(updated.revoked),
      }),
    });
    setConfirmForceSignOutId(null);
    pendingFocusId.current = forceSignOutActionId(id);
  };

  const handleCancelForceSignOut = (id: string) => {
    setConfirmForceSignOutId(null);
    pendingFocusId.current = forceSignOutActionId(id);
  };

  const renderRoleAction = (user: UserAccountRow) => {
    if (user.role === "standard") {
      return (
        <Button
          id={roleActionId(user.id)}
          text={t("Users_action_promote")}
          onClick={() => void handlePromote(user.id)}
        />
      );
    }

    // Guardrail: the last remaining active admin cannot be demoted
    // (FR-004). Self-demotion has no separate guard here — it is permitted
    // whenever another active admin remains (spec §Edge Cases).
    if (isLastActiveAdmin(user)) {
      return (
        <div>
          <Button
            id={roleActionId(user.id)}
            text={t("Users_action_demote")}
            disabled
            aria-describedby={roleReasonId(user.id)}
            onClick={() => {}}
          />
          <HelpText>
            <span id={roleReasonId(user.id)}>{t("Users_guardrail_last_admin_demote")}</span>
          </HelpText>
        </div>
      );
    }

    if (confirmDemoteId === user.id) {
      return (
        <div role="group" aria-label={t("Users_action_demote")}>
          <HelpText>
            {user.isSelf ? t("Users_demote_self_confirm_prompt") : t("Users_demote_confirm_prompt")}
          </HelpText>
          <ActionGroup>
            <Button
              id={`user-demote-confirm-${user.id}`}
              red
              text={t("Users_action_demote_confirm")}
              onClick={() => void handleDemote(user.id)}
            />
            <Button link text={t("Cancel")} onClick={() => handleCancelDemote(user.id)} />
          </ActionGroup>
        </div>
      );
    }

    return (
      <Button
        id={roleActionId(user.id)}
        text={t("Users_action_demote")}
        onClick={() => setConfirmDemoteId(user.id)}
      />
    );
  };

  const renderForceSignOutAction = (user: UserAccountRow) => {
    // No guardrails here (FR-009): force sign-out is never disabled, even on
    // the self row — signing yourself out of all devices is a legitimate
    // action (plan.md §Edge Cases, "Force-sign-out on one's own row evicts
    // the acting admin").
    if (confirmForceSignOutId === user.id) {
      return (
        <div role="group" aria-label={t("Users_action_force_sign_out")}>
          <HelpText>
            {user.isSelf
              ? t("Users_force_sign_out_self_confirm_prompt")
              : t("Users_force_sign_out_confirm_prompt")}
          </HelpText>
          <ActionGroup>
            <Button
              id={`user-force-sign-out-confirm-${user.id}`}
              red
              text={t("Users_action_force_sign_out_confirm")}
              onClick={() => void handleForceSignOut(user.id)}
            />
            <Button link text={t("Cancel")} onClick={() => handleCancelForceSignOut(user.id)} />
          </ActionGroup>
        </div>
      );
    }

    return (
      <Button
        id={forceSignOutActionId(user.id)}
        text={t("Users_action_force_sign_out")}
        onClick={() => setConfirmForceSignOutId(user.id)}
      />
    );
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
          <ActionGroup>
            <Button
              id={`user-deactivate-confirm-${user.id}`}
              red
              text={t("Users_action_deactivate_confirm")}
              onClick={() => void handleDeactivate(user.id)}
            />
            <Button link text={t("Cancel")} onClick={() => handleCancelDeactivate(user.id)} />
          </ActionGroup>
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
      <TableScroll role="region" aria-label={t("Users_page_heading")} tabIndex={0}>
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
              <td>
                <ActionStack>
                  {renderRoleAction(user)}
                  {renderRowAction(user)}
                  {renderForceSignOutAction(user)}
                </ActionStack>
              </td>
            </tr>
          ))}
        </Table>
      </TableScroll>
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
