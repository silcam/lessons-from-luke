/**
 * InvitationsList.tsx — Admin management screen: list all invitations + retract/re-copy actions
 *
 * Spec: specs/002-invitation-system/spec.md §US3, §FR-013..FR-016, §FR-019
 * Plan: plan.md §Presentation Design (InvitationsList component),
 *       plan.md §Accessibility Requirements
 *
 * Renders:
 *   - Table of all invitations: Email, Role, Status, Created, Accepted, Created By
 *   - Per-row Retract + Re-copy Link buttons (Pending only)
 *   - Copy-success announced via aria-live region
 *   - Empty state when no invitations exist
 */

import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../common/state/appState";
import {
  listInvitations,
  retractInvitation,
  getInvitationLink,
  InvitationSummaryRow,
} from "./invitationsListThunks";
import Button from "../../common/base-components/Button";
import Heading from "../../common/base-components/Heading";
import useTranslation from "../../common/util/useTranslation";

export default function InvitationsList() {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const [invitations, setInvitations] = useState<InvitationSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const action = await dispatch(listInvitations());
      if (!(action as { error?: unknown }).error) {
        setInvitations((action as { payload: InvitationSummaryRow[] }).payload);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetract = async (id: string) => {
    const action = await dispatch(retractInvitation(id));
    if (!(action as { error?: unknown }).error) {
      const updated = (action as { payload: InvitationSummaryRow }).payload;
      setInvitations((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
    }
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

  return (
    <div>
      <Heading level={2} text={t("Invitations_page_heading")} />

      {/* Accessible live region — copy-success announcement */}
      <div role="status" aria-live="polite">
        {copySuccess ? t("Invitation_copy_success") : ""}
      </div>

      {loading ? null : invitations.length === 0 ? (
        <p>{t("Invitations_empty_state")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("Invitations_column_email")}</th>
              <th>{t("Invitations_column_role")}</th>
              <th>{t("Invitations_column_status")}</th>
              <th>{t("Invitations_column_created")}</th>
              <th>{t("Invitations_column_accepted")}</th>
              <th>{t("Invitations_column_created_by")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.email}</td>
                <td>{formatRole(inv.role)}</td>
                <td>{formatStatus(inv.status)}</td>
                <td>{formatDate(inv.createdAt)}</td>
                <td>{formatDate(inv.acceptedAt)}</td>
                <td>{inv.invitedByEmail}</td>
                <td>
                  {inv.status === "pending" && (
                    <>
                      <Button
                        text={t("Invitations_action_recopy")}
                        onClick={() => void handleRecopy(inv.id)}
                      />
                      <Button
                        red
                        text={t("Invitations_action_retract")}
                        onClick={() => void handleRetract(inv.id)}
                      />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
