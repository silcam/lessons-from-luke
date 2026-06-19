/**
 * CreateInvitation.tsx — Admin form to create a single-use invitation link
 *
 * Spec: specs/002-invitation-system/spec.md §US1, §FR-001..FR-006
 * Plan: plan.md §Presentation Design §UI Decisions (Create-invitation form),
 *       plan.md §Accessibility Requirements
 *
 * Renders:
 *   - Email input + role select + submit button (Enter submits)
 *   - On success: "Invitation ready" heading, share guidance, the generated
 *     link in a selectable box, a keyboard-operable Copy Link button, a visible
 *     + announced copy confirmation, and a "Create another" reset
 *   - Inline validation/error via Alert (role="alert") for 409 variants
 */

import React, { useState } from "react";
import styled from "styled-components";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { AppDispatch } from "../../common/state/appState";
import { pushLogout } from "../auth/authThunks";
import { createInvitation, InvitationError, InvitationResult } from "./invitationThunks";
import { StdHeaderBarPage } from "../../common/base-components/HeaderBar";
import { FlexRow } from "../../common/base-components/Flex";
import Div from "../../common/base-components/Div";
import TextInput from "../../common/base-components/TextInput";
import SelectInput from "../../common/base-components/SelectInput";
import Button from "../../common/base-components/Button";
import Alert from "../../common/base-components/Alert";
import Label from "../../common/base-components/Label";
import PDiv from "../../common/base-components/PDiv";
import Heading from "../../common/base-components/Heading";
import HandleKey from "../../common/base-components/HandleKey";
import HelpText from "../../common/base-components/HelpText";
import Colors from "../../common/util/Colors";
import useTranslation from "../../common/util/useTranslation";

type SubmitError = InvitationError | null;

// The generated link is shown as selectable text (one click selects it all) in a
// hairline box — kept as text, not an input, so it wraps and is easy to copy by hand.
const LinkBox = styled.p`
  word-break: break-all;
  user-select: all;
  border: 1px solid ${Colors.lightGrey};
  border-radius: 0.25em;
  padding: 0.5em 0.7em;
  margin: 0.5em 0;
`;

export default function CreateInvitation() {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const logOut = () => dispatch(pushLogout());

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"standard" | "admin">("standard");
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [submitError, setSubmitError] = useState<SubmitError>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const roleOptions: [string, string][] = [
    ["standard", t("Invitation_role_standard")],
    ["admin", t("Invitation_role_admin")],
  ];

  const handleSubmit = async () => {
    setSubmitError(null);
    setCopySuccess(false);
    setResult(null);
    setSubmitting(true);

    try {
      // createAsyncThunk returns an action with .payload; unwrapResult would throw
      // on rejection. We inspect the returned action instead to stay compatible
      // with the test mock pattern (which returns {payload, error}).
      const action = await dispatch(createInvitation({ email, role }));

      // If the action carries an error field (rejected), surface the error payload
      if ((action as { error?: unknown }).error) {
        setSubmitError((action as { payload: InvitationError }).payload);
      } else {
        setResult((action as { payload: InvitationResult }).payload);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!result?.link) return;
    // Reset before the async operation so React sees a state change on every
    // successful copy, forcing the aria-live region to re-announce "Copied!".
    setCopySuccess(false);
    try {
      await navigator.clipboard.writeText(result.link);
      setCopySuccess(true);
    } catch {
      // Clipboard write failed — still show the link so user can copy manually
    }
  };

  const resetForm = () => {
    setResult(null);
    setCopySuccess(false);
    setSubmitError(null);
    setEmail("");
    setRole("standard");
  };

  const errorMessage = (): string | null => {
    if (!submitError) return null;
    switch (submitError.code) {
      case "account_exists":
        return t("Invitation_error_account_exists");
      case "active_pending":
        return t("Invitation_error_active_pending");
      default:
        return t("Invitation_error_generic");
    }
  };

  const errMsg = errorMessage();

  return (
    <StdHeaderBarPage
      title={t("Invitation_submit")}
      renderRight={() => (
        <FlexRow>
          <Link to="/admin/invitations">
            <Button text={t("Invitations_page_heading")} onClick={() => {}} />
          </Link>
          <Button text={t("Log_out")} onClick={logOut} />
        </FlexRow>
      )}
    >
      <Div pad>
        {!result ? (
          <HandleKey onEnter={handleSubmit}>
            <PDiv>
              <Label text={t("Invitation_email_label")}>
                <TextInput
                  value={email}
                  setValue={(v) => {
                    setEmail(v);
                    setSubmitError(null);
                  }}
                  placeholder={t("Email")}
                  autoFocus
                />
              </Label>
            </PDiv>

            <PDiv>
              <Label text={t("Invitation_role_label")}>
                <SelectInput
                  value={role}
                  setValue={(v) => setRole(v as "standard" | "admin")}
                  options={roleOptions}
                />
              </Label>
            </PDiv>

            {errMsg && (
              <div role="alert">
                <Alert danger>{errMsg}</Alert>
              </div>
            )}

            <Button disabled={submitting} onClick={handleSubmit} text={t("Invitation_submit")} />
          </HandleKey>
        ) : (
          <>
            <Heading level={3} text={t("Invitation_create_heading_ready")} />
            <HelpText>{t("Invitation_share_instructions")}</HelpText>

            <LinkBox>{result.link}</LinkBox>

            <Button
              onClick={handleCopyLink}
              text={t("Invitation_copy_link")}
              aria-label={t("Invitation_copy_link")}
            />

            {/* Accessible + visible copy-success confirmation */}
            <div role="status" aria-live="polite">
              {copySuccess ? <Alert success>{t("Invitation_copy_success")}</Alert> : ""}
            </div>

            <PDiv />
            <Button link text={t("Invitation_create_another")} onClick={resetForm} />
          </>
        )}
      </Div>
    </StdHeaderBarPage>
  );
}
