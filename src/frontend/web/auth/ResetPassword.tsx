/**
 * ResetPassword.tsx — Self-service password-reset completion page
 *
 * Route: /reset-password?token=<reset-token>
 * Spec: specs/005-transactional-email-reset/spec.md §US1
 * Plan: plan.md §Presentation Design (UI Decisions), §Accessibility Requirements,
 *       §Security Considerations (Pass 1 — token URL confidentiality)
 *
 * Security: The token is read from ?token= into local state on mount, then
 * window.history.replaceState is called immediately to scrub the token from
 * the address bar (and from browser history). This prevents the token from
 * leaking via the Referer header or browser history (SC-003).
 */

import React, { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { AppDispatch } from "../../common/state/appState";
import { resetPassword, type PasswordResetError } from "./passwordResetThunks";
import TextInput from "../../common/base-components/TextInput";
import Button from "../../common/base-components/Button";
import Alert from "../../common/base-components/Alert";
import Label from "../../common/base-components/Label";
import HelpText from "../../common/base-components/HelpText";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import Heading from "../../common/base-components/Heading";
import HandleKey from "../../common/base-components/HandleKey";
import PDiv from "../../common/base-components/PDiv";
import useTranslation from "../../common/util/useTranslation";
import AppLink from "../common/AppLink";

type Phase =
  | { status: "form" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "invalid_token" }
  | { status: "policy_error"; message: string }
  | { status: "error"; message: string };

export default function ResetPassword(): React.ReactElement {
  const t = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const navigate = useNavigate();

  // Read the token from the URL query string once on mount, then scrub the URL
  const [token] = useState<string>(() => {
    return new URLSearchParams(location.search).get("token") ?? "";
  });

  const [newPassword, setNewPassword] = useState("");
  const [phase, setPhase] = useState<Phase>({ status: "form" });
  const resultRef = useRef<HTMLDivElement>(null);

  // Scrub the token from the address bar immediately on mount (Pass 1 — SC-003)
  useEffect(() => {
    window.history.replaceState("", "", "/reset-password");
  }, []);

  useEffect(() => {
    document.title = `${t("ResetPassword_heading")} — Lessons from Luke`;
  }, [t]);

  // Move focus to result heading on terminal state transitions (Pass 8 a11y)
  useEffect(() => {
    if ((phase.status === "success" || phase.status === "invalid_token") && resultRef.current) {
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
    setPhase({ status: "submitting" });

    const result = await dispatch(resetPassword({ token, newPassword }));
    const r = result as { payload?: PasswordResetError; error?: unknown };

    if (r.error) {
      const errCode = r.payload?.code ?? "network_error";
      if (errCode === "invalid_token") {
        setPhase({ status: "invalid_token" });
      } else if (errCode === "password_too_short" || errCode === "password_too_long") {
        setPhase({
          status: "policy_error",
          message:
            r.payload?.message ??
            (errCode === "password_too_short"
              ? t("ResetPassword_error_too_short")
              : t("ResetPassword_error_generic")),
        });
      } else {
        setPhase({
          status: "error",
          message: r.payload?.message ?? t("ResetPassword_error_generic"),
        });
      }
    } else {
      setPhase({ status: "success" });
    }
  };

  const goToSignIn = () => navigate("/");

  // ── Success state ────────────────────────────────────────────────────────────

  if (phase.status === "success") {
    return (
      <MiddleOfPage>
        <div ref={resultRef}>
          <Heading level={2} text={t("ResetPassword_success_heading")} />
          <p>{t("ResetPassword_success_message")}</p>
          <PDiv />
          <Button bigger onClick={goToSignIn} text={t("ResetPassword_continue_to_sign_in")} />
        </div>
      </MiddleOfPage>
    );
  }

  // ── Invalid token error (terminal) ───────────────────────────────────────────

  if (phase.status === "invalid_token") {
    return (
      <MiddleOfPage>
        <div ref={resultRef} role="alert">
          <Heading level={2} text={t("ResetPassword_invalid_token_heading")} />
          <Alert danger>{t("ResetPassword_invalid_token_message")}</Alert>
        </div>
        <PDiv />
        <AppLink to="/forgot-password">{t("ResetPassword_request_new_link")}</AppLink>
      </MiddleOfPage>
    );
  }

  // ── Password form ────────────────────────────────────────────────────────────

  const submitting = phase.status === "submitting";

  const inlineError = (): string | null => {
    if (phase.status === "policy_error") return phase.message;
    if (phase.status === "error") return phase.message;
    return null;
  };

  const err = inlineError();

  return (
    <MiddleOfPage>
      <HandleKey onEnter={handleSubmit}>
        <Heading level={1} text="Lessons from Luke" />
        <Heading level={3} text={t("ResetPassword_heading")} />

        {err && (
          <div role="alert">
            <Alert danger>{err}</Alert>
          </div>
        )}

        <PDiv>
          <Label text={t("ResetPassword_new_password_label")}>
            <TextInput
              value={newPassword}
              setValue={(v) => {
                setNewPassword(v);
                // Clear transient policy errors when user edits the field
                if (phase.status === "policy_error" || phase.status === "error") {
                  setPhase({ status: "form" });
                }
              }}
              password
              autoComplete="new-password"
              autoFocus
            />
          </Label>
          <HelpText>{t("ResetPassword_new_password_help")}</HelpText>
        </PDiv>

        <Button
          bigger
          disabled={submitting}
          onClick={handleSubmit}
          text={t("ResetPassword_submit")}
        />
      </HandleKey>
    </MiddleOfPage>
  );
}
