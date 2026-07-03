/**
 * UsersList.tsx — Admin account roster screen
 *
 * Spec: specs/006-user-account-management/spec.md §US1, §FR-001, §FR-002,
 *       §Acceptance Scenarios 1-3
 * Plan: plan.md §Presentation Design §UI Decisions (UsersList component),
 *       plan.md §Accessibility Target (WCAG 2.2 AA)
 *
 * Renders:
 *   - Loading indicator while fetching; a distinct error state with retry
 *     (a failed fetch must not read as "no users")
 *   - Kit Table of all accounts: Name, Email, Role, Status, Created
 *   - Own row marked "You"; status shown as a text label (WCAG 1.4.1), not
 *     color-only
 *   - Empty state when no accounts exist
 */

import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import { listUsers, UserAccountRow } from "./usersListThunks";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import Div from "../../common/base-components/Div";
import Button from "../../common/base-components/Button";
import Table from "../../common/base-components/Table";
import Alert from "../../common/base-components/Alert";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import HelpText from "../../common/base-components/HelpText";
import useTranslation from "../../common/util/useTranslation";

export default function UsersList() {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());

  const [users, setUsers] = useState<UserAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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

  const formatRole = (role: string): string => {
    if (role === "admin") return t("Invitation_role_admin");
    return t("Invitation_role_standard");
  };

  const formatStatus = (status: string): string => {
    if (status === "deactivated") return t("Users_status_deactivated");
    return t("Users_status_active");
  };

  const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();

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
      <Div pad>{renderBody()}</Div>
    </StdHeaderBarPage>
  );
}
