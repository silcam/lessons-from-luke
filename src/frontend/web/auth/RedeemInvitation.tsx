/**
 * RedeemInvitation.tsx — Recipient redemption form at /invitation/:token
 *
 * Spec: specs/002-invitation-system/spec.md §US2, §FR-007..FR-012
 * Plan: plan.md §UI Decisions (Recipient redemption form),
 *       plan.md §Security Considerations (Pass 9 — three-way error branch)
 *
 * Renders:
 *   - Loading state while looking up the token
 *   - Terminal error (FR-010) for 410 invalid/unknown/expired/retracted link
 *   - Transient rate-limited message (Pass 9) for 429 — a valid link MUST NOT read as dead
 *   - Generic try-again for other errors
 *   - Form with locked pre-filled email + password + display name
 *   - On submit success: redirect to sign-in (FR-012)
 */

import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { AppDispatch } from "../../common/state/appState";
import {
  lookupInvitation,
  acceptInvitation,
  type RedemptionError,
} from "./redeemInvitationThunks";
import TextInput from "../../common/base-components/TextInput";
import Button from "../../common/base-components/Button";
import Alert from "../../common/base-components/Alert";
import Label from "../../common/base-components/Label";
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

    const action = await dispatch(
      acceptInvitation({ token, password, name })
    );

    if ((action as { error?: unknown }).error) {
      const err = (action as { payload: RedemptionError }).payload;
      if (err?.code === "invalid_link") {
        setSubmitState({ phase: "invalid_link" });
      } else if (err?.code === "rate_limited") {
        setSubmitState({ phase: "rate_limited" });
      } else {
        setSubmitState({ phase: "error" });
      }
    } else {
      setSubmitState({ phase: "success" });
      // Redirect to sign-in after a short pause so the user can read the success message
      setTimeout(() => navigate("/"), 2000);
    }
  };

  // ── Lookup states ──────────────────────────────────────────────────────────

  if (lookupState.phase === "loading") {
    return (
      <MiddleOfPage>
        <LoadingSnake />
      </MiddleOfPage>
    );
  }

  if (lookupState.phase === "invalid_link") {
    return (
      <MiddleOfPage>
        <div role="alert">
          <Alert danger>{t("Invitation_error_invalid_link")}</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  if (lookupState.phase === "rate_limited") {
    return (
      <MiddleOfPage>
        <div role="alert">
          <Alert danger>{t("Invitation_error_rate_limited")}</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  if (lookupState.phase === "error") {
    return (
      <MiddleOfPage>
        <div role="alert">
          <Alert danger>{t("Invitation_error_generic")}</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (submitState.phase === "success") {
    return (
      <MiddleOfPage>
        <div role="status">
          <Alert>{t("Invitation_redeem_success")}</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  // ── Terminal submit errors (replace form) ──────────────────────────────────

  if (submitState.phase === "invalid_link") {
    return (
      <MiddleOfPage>
        <div role="alert">
          <Alert danger>{t("Invitation_error_invalid_link")}</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  // ── Redemption form ────────────────────────────────────────────────────────

  const { email } = lookupState;
  const submitting = submitState.phase === "submitting";

  const inlineErrorMessage = (): string | null => {
    if (submitState.phase === "rate_limited") return t("Invitation_error_rate_limited");
    if (submitState.phase === "error") return t("Invitation_error_generic");
    return null;
  };

  const inlineErr = inlineErrorMessage();

  return (
    <MiddleOfPage>
      <HandleKey onEnter={handleSubmit}>
        <Heading level={1} text={t("Invitation_email_locked_label")} />

        {/* Locked email — pre-filled and not editable (FR-007) */}
        <Label text={t("Invitation_email_locked_label")}>
          <TextInput
            value={email}
            setValue={() => {
              /* locked */
            }}
            disabled
            aria-readonly="true"
          />
        </Label>

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

        <Label text={t("Invitation_display_name_label")}>
          <TextInput
            value={name}
            setValue={(v) => {
              setName(v);
              setSubmitState({ phase: "idle" });
            }}
          />
        </Label>

        {inlineErr && (
          <div role="alert">
            <Alert danger>{inlineErr}</Alert>
          </div>
        )}

        <Button
          disabled={submitting}
          onClick={handleSubmit}
          text={t("Invitation_redeem_submit")}
        />
      </HandleKey>
    </MiddleOfPage>
  );
}
