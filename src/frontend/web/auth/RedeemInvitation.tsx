/**
 * RedeemInvitation.tsx — Recipient redemption form at /invitation/:token
 *
 * Spec: specs/002-invitation-system/spec.md §US2, §FR-007..FR-012
 * Plan: plan.md §UI Decisions (Recipient redemption form),
 *       plan.md §Security Considerations (Pass 9 — three-way error branch)
 *
 * Renders:
 *   - Loading state while looking up the token
 *   - Terminal error (FR-010) for 410 invalid/unknown/expired/retracted link —
 *     never a dead end: shows the app title + a "Go to sign in" action
 *   - Transient rate-limited message (Pass 9) for 429 — a valid link MUST NOT read as dead
 *   - Generic try-again for other errors
 *   - Form with locked (readOnly) pre-filled email + password + display name,
 *     each with inline guidance (email source, password requirement)
 *   - On submit success: green confirmation + an explicit "Continue to sign in"
 *     button (no auto-redirect). FR-012 (directed to sign-in, no auto-session)
 *     is satisfied by that button.
 */

import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AppDispatch } from "../../common/state/appState";
import { lookupInvitation, acceptInvitation, type RedemptionError } from "./redeemInvitationThunks";
import TextInput from "../../common/base-components/TextInput";
import Button from "../../common/base-components/Button";
import Alert from "../../common/base-components/Alert";
import Label from "../../common/base-components/Label";
import PDiv from "../../common/base-components/PDiv";
import HelpText from "../../common/base-components/HelpText";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import Heading from "../../common/base-components/Heading";
import HandleKey from "../../common/base-components/HandleKey";
import LoadingSnake from "../../common/base-components/LoadingSnake";
import useTranslation from "../../common/util/useTranslation";

type LookupState =
  | { phase: "loading" }
  | { phase: "invalid_link" }
  | { phase: "rate_limited" }
  | { phase: "error" }
  | { phase: "form"; email: string };

type SubmitState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "invalid_link" }
  | { phase: "rate_limited" }
  | { phase: "validation_error"; message: string }
  | { phase: "error" }
  | { phase: "success" };

interface Props {
  token: string;
}

export default function RedeemInvitation({ token }: Props) {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const [lookupState, setLookupState] = useState<LookupState>({ phase: "loading" });
  const [submitState, setSubmitState] = useState<SubmitState>({ phase: "idle" });
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const doLookup = async () => {
      const action = await dispatch(lookupInvitation(token));

      if (cancelled) return;

      if ((action as { error?: unknown }).error) {
        const err = (action as { payload: RedemptionError }).payload;
        if (err?.code === "invalid_link") {
          setLookupState({ phase: "invalid_link" });
        } else if (err?.code === "rate_limited") {
          setLookupState({ phase: "rate_limited" });
        } else {
          setLookupState({ phase: "error" });
        }
      } else {
        const result = (action as { payload: { email: string } }).payload;
        setLookupState({ phase: "form", email: result.email });
      }
    };

    void doLookup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async () => {
    if (lookupState.phase !== "form") return;
    setSubmitState({ phase: "submitting" });

    const action = await dispatch(acceptInvitation({ token, password, name }));

    if ((action as { error?: unknown }).error) {
      const err = (action as { payload: RedemptionError }).payload;
      if (err?.code === "invalid_link") {
        setSubmitState({ phase: "invalid_link" });
      } else if (err?.code === "rate_limited") {
        setSubmitState({ phase: "rate_limited" });
      } else if (err?.code === "validation_error") {
        // Surface the server's specific reason (e.g. "Password must be at
        // least 12 characters") instead of an opaque generic error.
        setSubmitState({ phase: "validation_error", message: err.message });
      } else {
        setSubmitState({ phase: "error" });
      }
    } else {
      setSubmitState({ phase: "success" });
    }
  };

  const goToSignIn = () => navigate("/");

  // ── Lookup states ──────────────────────────────────────────────────────────

  if (lookupState.phase === "loading") {
    return (
      <MiddleOfPage>
        <LoadingSnake />
      </MiddleOfPage>
    );
  }

  // A recipient holding a one-time link is never stranded: every terminal state
  // shows the app title for orientation and a clear way forward.
  const terminalError = (message: string, help?: string) => (
    <MiddleOfPage>
      <Heading level={1} text="Lessons from Luke" />
      <div role="alert">
        <Alert danger>{message}</Alert>
      </div>
      {help ? <HelpText>{help}</HelpText> : null}
      <PDiv />
      <Button bigger text={t("Invitation_go_to_sign_in")} onClick={goToSignIn} />
    </MiddleOfPage>
  );

  if (lookupState.phase === "invalid_link") {
    return terminalError(t("Invitation_error_invalid_link"), t("Invitation_invalid_link_help"));
  }

  if (lookupState.phase === "rate_limited") {
    return terminalError(t("Invitation_error_rate_limited"));
  }

  if (lookupState.phase === "error") {
    return terminalError(t("Invitation_error_generic"));
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitState.phase === "success") {
    return (
      <MiddleOfPage>
        <Heading level={1} text="Lessons from Luke" />
        <div role="status">
          <Alert success>{t("Invitation_redeem_success")}</Alert>
        </div>
        <PDiv />
        <Button bigger text={t("Invitation_redeem_continue")} onClick={goToSignIn} />
      </MiddleOfPage>
    );
  }

  // ── Terminal submit errors (replace form) ──────────────────────────────────

  if (submitState.phase === "invalid_link") {
    return terminalError(t("Invitation_error_invalid_link"), t("Invitation_invalid_link_help"));
  }

  // ── Redemption form ────────────────────────────────────────────────────────

  const { email } = lookupState;
  const submitting = submitState.phase === "submitting";

  const inlineErrorMessage = (): string | null => {
    if (submitState.phase === "rate_limited") return t("Invitation_error_rate_limited");
    if (submitState.phase === "validation_error")
      return submitState.message || t("Invitation_error_generic");
    if (submitState.phase === "error") return t("Invitation_error_generic");
    return null;
  };

  const inlineErr = inlineErrorMessage();

  return (
    <MiddleOfPage>
      <HandleKey onEnter={handleSubmit}>
        <Heading level={1} text="Lessons from Luke" />
        <Heading level={3} text={t("Invitation_redeem_submit")} />

        {/* Locked email — pre-filled and read-only (FR-007). readOnly (not
            disabled) keeps it focusable/announced and avoids reading as broken. */}
        <PDiv>
          <Label text={t("Invitation_email_locked_label")}>
            <TextInput
              value={email}
              setValue={() => {
                /* locked */
              }}
              readOnly
            />
          </Label>
          <HelpText>{t("Invitation_email_locked_help")}</HelpText>
        </PDiv>

        <PDiv>
          <Label text={t("Invitation_password_label")}>
            <TextInput
              value={password}
              setValue={(v) => {
                setPassword(v);
                setSubmitState({ phase: "idle" });
              }}
              password
              autoFocus
            />
          </Label>
          <HelpText>{t("Invitation_password_help")}</HelpText>
        </PDiv>

        <PDiv>
          <Label text={t("Invitation_display_name_label")}>
            <TextInput
              value={name}
              setValue={(v) => {
                setName(v);
                setSubmitState({ phase: "idle" });
              }}
            />
          </Label>
        </PDiv>

        {inlineErr && (
          <div role="alert">
            <Alert danger>{inlineErr}</Alert>
          </div>
        )}

        <Button
          bigger
          disabled={submitting}
          onClick={handleSubmit}
          text={t("Invitation_redeem_submit")}
        />
      </HandleKey>
    </MiddleOfPage>
  );
}
