/**
 * ForgotPassword.tsx — Self-service "forgot password" request page
 *
 * Route: /forgot-password
 * Spec: specs/005-transactional-email-reset/spec.md §US1
 * Plan: plan.md §Presentation Design (UI Decisions), §Accessibility Requirements
 */

import React, { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { AppDispatch } from "../../common/state/appState";
import { requestPasswordReset, type PasswordResetError } from "./passwordResetThunks";
import TextInput from "../../common/base-components/TextInput";
import Button from "../../common/base-components/Button";
import Alert from "../../common/base-components/Alert";
import Label from "../../common/base-components/Label";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import Heading from "../../common/base-components/Heading";
import HandleKey from "../../common/base-components/HandleKey";
import PDiv from "../../common/base-components/PDiv";
import useTranslation from "../../common/util/useTranslation";

type Phase =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function ForgotPassword(): React.ReactElement {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${t("ForgotPassword_heading")} — Lessons from Luke`;
  }, [t]);

  // Move focus to result heading on success transition (Pass 8 a11y)
  useEffect(() => {
    if (phase.status === "success" && resultRef.current) {
      const heading = resultRef.current.querySelector(
        "h1, h2, h3, h4, h5, h6"
      ) as HTMLElement | null;
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }
  }, [phase.status]);

  const handleSubmit = async () => {
    setPhase({ status: "loading" });

    const result = await dispatch(requestPasswordReset(email));
    const r = result as { payload?: PasswordResetError; error?: unknown };

    if (r.error) {
      const errPayload = r.payload;
      setPhase({
        status: "error",
        message: errPayload?.message ?? t("ForgotPassword_error_generic"),
      });
    } else {
      setPhase({ status: "success" });
    }
  };

  // ── Success state ────────────────────────────────────────────────────────────

  if (phase.status === "success") {
    return (
      <MiddleOfPage>
        <div ref={resultRef}>
          <Heading level={2} text={t("ForgotPassword_confirmation_heading")} />
          <p>{t("ForgotPassword_confirmation_message")}</p>
        </div>
      </MiddleOfPage>
    );
  }

  // ── Request form ─────────────────────────────────────────────────────────────

  const submitting = phase.status === "loading";

  return (
    <MiddleOfPage>
      <HandleKey onEnter={handleSubmit}>
        <Heading level={1} text="Lessons from Luke" />
        <Heading level={3} text={t("ForgotPassword_heading")} />

        {phase.status === "error" && (
          <div role="alert">
            <Alert danger>{phase.message}</Alert>
          </div>
        )}

        <PDiv>
          <Label text={t("ForgotPassword_email_label")}>
            <TextInput
              value={email}
              setValue={setEmail}
              autoComplete="email"
              inputMode="email"
              autoFocus
            />
          </Label>
        </PDiv>

        <Button
          bigger
          disabled={submitting}
          onClick={handleSubmit}
          text={t("ForgotPassword_submit")}
        />
      </HandleKey>
    </MiddleOfPage>
  );
}
