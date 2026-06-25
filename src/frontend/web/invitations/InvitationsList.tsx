/**
 * InvitationsList.tsx — Admin management screen: list all invitations + retract/re-copy actions
 *
 * Spec: specs/002-invitation-system/spec.md §US3, §FR-013..FR-016, §FR-019
 * Plan: plan.md §Presentation Design (InvitationsList component),
 *       plan.md §Accessibility Requirements
 *
 * Renders:
 *   - Loading indicator while fetching; a distinct error state with retry
 *     (a failed fetch must not read as "no invitations")
 *   - Kit Table of all invitations: Email, Role, Status, Created, Accepted, Created By
 *   - Per-row Re-copy Link + Retract actions (Pending only). Retract is
 *     destructive, so it requires an inline two-click confirm.
 *   - Copy-success announced via aria-live and shown as a success Alert
 *   - Empty state when no invitations exist
 */

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import {
  listInvitations,
  retractInvitation,
  getInvitationLink,
  InvitationSummaryRow,
} from "./invitationsListThunks";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { FlexRow, FlexCol } from "../../common/base-components/Flex";
import Div from "../../common/base-components/Div";
import Button from "../../common/base-components/Button";
import Table from "../../common/base-components/Table";
import Alert from "../../common/base-components/Alert";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import HelpText from "../../common/base-components/HelpText";
import useTranslation from "../../common/util/useTranslation";

// Visually hidden, still announced — for the actions column header.
const SrOnly = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

// Keeps row action buttons grouped with consistent spacing and graceful wrapping.
const ActionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em;
  align-items: center;
`;

export default function InvitationsList() {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());

  const [invitations, setInvitations] = useState<InvitationSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [confirmRetractId, setConfirmRetractId] = useState<string | null>(null);

  // No synchronous setState here — `loading` already initializes to true, so the
  // mount effect can call this directly without triggering cascading renders.
  const load = async () => {
    const action = await dispatch(listInvitations());
    if ((action as { error?: unknown }).error) {
      // Distinct from empty: a failed fetch must not masquerade as "no invitations".
      setLoadError(true);
    } else {
      setInvitations((action as { payload: InvitationSummaryRow[] }).payload);
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

  const handleRetract = async (id: string) => {
    const action = await dispatch(retractInvitation(id));
    if (!(action as { error?: unknown }).error) {
      const updated = (action as { payload: InvitationSummaryRow }).payload;
      setInvitations((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
    }
    setConfirmRetractId(null);
  };

  const handleRecopy = async (id: string) => {
    // Reset before the async operation so React sees a state change on every
    // successful copy, even if copySuccess was already true.  Without this the
    // aria-live region receives the same text on re-copy and screen-readers
    // silently skip the re-announcement.
    setCopySuccess(false);
    const action = await dispatch(getInvitationLink(id));
    if (!(action as { error?: unknown }).error) {
      const { link } = (action as { payload: { id: string; link: string } }).payload;
      try {
        await navigator.clipboard.writeText(link);
        setCopySuccess(true);
      } catch {
        // Clipboard write failed — silently ignore
      }
    }
  };

  const formatRole = (role: string): string => {
    if (role === "admin") return t("Invitation_role_admin");
    return t("Invitation_role_standard");
  };

  const formatStatus = (status: string): string => {
    switch (status) {
      case "pending":
        return t("Invitations_status_pending");
      case "accepted":
        return t("Invitations_status_accepted");
      case "expired":
        return t("Invitations_status_expired");
      case "retracted":
        return t("Invitations_status_retracted");
      default:
        return status;
    }
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString();
  };

  const renderRowActions = (inv: InvitationSummaryRow) => {
    if (inv.status !== "pending") return null;

    if (confirmRetractId === inv.id) {
      return (
        <div role="group" aria-label={t("Invitations_action_retract")}>
          <HelpText>{t("Invitations_retract_confirm_prompt")}</HelpText>
          <ActionGroup>
            <Button
              red
              text={t("Invitations_action_retract_confirm")}
              onClick={() => void handleRetract(inv.id)}
            />
            <Button link text={t("Cancel")} onClick={() => setConfirmRetractId(null)} />
          </ActionGroup>
        </div>
      );
    }

    return (
      <ActionGroup>
        <Button text={t("Invitations_action_recopy")} onClick={() => void handleRecopy(inv.id)} />
        <Button
          red
          text={t("Invitations_action_retract")}
          onClick={() => setConfirmRetractId(inv.id)}
        />
      </ActionGroup>
    );
  };

  const renderBody = () => {
    if (loading) {
      return (
        <>
          <LoadingSnake />
          <HelpText>{t("Invitations_loading")}</HelpText>
        </>
      );
    }

    if (loadError) {
      return (
        <>
          <div role="alert">
            <Alert danger>{t("Invitations_load_error")}</Alert>
          </div>
          <Button text={t("TryAgain")} onClick={reload} />
        </>
      );
    }

    if (invitations.length === 0) {
      return <p>{t("Invitations_empty_state")}</p>;
    }

    return (
      <Table
        header={
          <tr>
            <th>{t("Invitations_column_email")}</th>
            <th>{t("Invitations_column_role")}</th>
            <th>{t("Invitations_column_status")}</th>
            <th>{t("Invitations_column_created")}</th>
            <th>{t("Invitations_column_accepted")}</th>
            <th>{t("Invitations_column_created_by")}</th>
            <th>
              <SrOnly>{t("Invitations_column_actions")}</SrOnly>
            </th>
          </tr>
        }
      >
        {invitations.map((inv) => (
          <tr key={inv.id}>
            <td>{inv.email}</td>
            <td>{formatRole(inv.role)}</td>
            <td>{formatStatus(inv.status)}</td>
            <td>{formatDate(inv.createdAt)}</td>
            <td>{formatDate(inv.acceptedAt)}</td>
            <td>{inv.invitedByEmail}</td>
            <td>{renderRowActions(inv)}</td>
          </tr>
        ))}
      </Table>
    );
  };

  return (
    <StdHeaderBarPage
      title={t("Invitations_page_heading")}
      renderRight={() => <Button text={t("Log_out")} onClick={logOut} />}
    >
      <Div pad>
        {/* Accessible + visible copy-success announcement */}
        <div role="status" aria-live="polite">
          {copySuccess ? <Alert success>{t("Invitation_copy_success")}</Alert> : ""}
        </div>

        {/*
          Primary action lives in the page body (not the header chrome). The empty
          FlexCol spacer pushes it to the trailing edge — the same right-alignment
          pattern the header bar uses. Rendered above renderBody() so it is present
          in every state, including the empty state where the first invitation is
          created.
        */}
        <FlexRow>
          <FlexCol />
          <Link to="/admin/invitations/new">
            <Button text={t("Invitation_submit")} onClick={() => {}} />
          </Link>
        </FlexRow>

        {renderBody()}
      </Div>
    </StdHeaderBarPage>
  );
}
