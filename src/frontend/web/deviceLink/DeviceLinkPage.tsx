/**
 * DeviceLinkPage.tsx — Device link / pairing approval page at /link
 *
 * Spec: specs/004-desktop-auth-pairing/plan.md §Presentation Design
 *       §Accessibility Requirements (/link page focus management)
 *       §Security Considerations (anti-phishing consent copy)
 *       spec.md §FR-002 §FR-003
 * Task: lessons-from-luke-wgr.5.3.7
 *
 * Two-step flow (required by the better-auth device-authorization plugin):
 *   1. On mount (or on manual submit): claimCode(userCode) — associates the
 *      signed-in user's session with the deviceCode row.
 *   2a. Approve: approveCode(userCode) — transitions to "approved"; the
 *       desktop's next /device/token poll receives the session token.
 *   2b. Decline: denyCode(userCode) — transitions to "denied"; the desktop
 *       gets access_denied.
 *
 * Security: the consent copy is a required security control (FR-002, FR-003):
 *   "Connect a new desktop? This lets that computer act as your account.
 *    Only continue if you started this on your own machine."
 * It anchors the user's decision on *their own intent*, not on client_id
 * trust (which is self-asserted and therefore untrustworthy as a signal).
 *
 * Accessibility (WCAG 2.2 AA):
 *   - Initial keyboard focus lands on the Approve button after a pre-filled
 *     claim so keyboard/screen-reader users reach the decision immediately.
 *   - Status changes (loading, approved, declined, errors) are announced via
 *     role="status" (implicit aria-live="polite").
 *   - Approve/Decline are fully keyboard-operable (visible focus ring via
 *     the base-components Button).
 */

import React, { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import { type AppDispatch } from "../../common/state/appState";
import { claimCode, approveCode, denyCode, type DeviceLinkError } from "./deviceLinkThunks";
import Alert from "../../common/base-components/Alert";
import Button from "../../common/base-components/Button";
import Heading from "../../common/base-components/Heading";
import HelpText from "../../common/base-components/HelpText";
import Label from "../../common/base-components/Label";
import MiddleOfPage from "../../common/base-components/MiddleOfPage";
import PDiv from "../../common/base-components/PDiv";
import TextInput from "../../common/base-components/TextInput";
import LoadingSnake from "../../common/base-components/LoadingSnake";

// ── State machine ─────────────────────────────────────────────────────────────

type PageState =
  /** No ?user_code in URL — show manual entry input */
  | { phase: "input"; userCode: string }
  /** Claim in progress (auto from URL or manual submit) */
  | { phase: "claiming" }
  /** Claim succeeded — show consent copy + Approve / Decline */
  | { phase: "ready"; userCode: string; actionError?: string }
  /** Approve request in flight */
  | { phase: "approving"; userCode: string }
  /** Deny request in flight */
  | { phase: "declining"; userCode: string }
  /** Terminal success: approved */
  | { phase: "approved" }
  /** Terminal: declined */
  | { phase: "declined" }
  /** Terminal: claim failed */
  | { phase: "claim_error"; code: string };

// ── Error message helpers ─────────────────────────────────────────────────────

function claimErrorMessage(code: string): string {
  switch (code) {
    case "expired":
      return "This pairing code has expired. Start a new connection on the desktop app and try again.";
    case "rate_limited":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      return "Something went wrong. Please check your code and try again.";
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DeviceLinkPage() {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const urlCode = params.get("user_code") ?? "";

  // Initialise phase based on whether the URL has a pre-filled user_code.
  const [state, setState] = useState<PageState>(
    urlCode ? { phase: "claiming" } : { phase: "input", userCode: "" }
  );

  /** Wrapper div around the Approve button — used to focus the button after a
   *  pre-filled claim. (Button does not forward refs, so we target it via the
   *  wrapper's querySelector instead.) */
  const approveWrapperRef = useRef<HTMLDivElement>(null);

  // Auto-claim on mount when ?user_code is present in the URL.
  useEffect(() => {
    if (!urlCode) return;

    let cancelled = false;

    const doClaim = async () => {
      const action = await dispatch(claimCode(urlCode));
      if (cancelled) return;
      if ((action as { error?: unknown }).error) {
        const err = (action as { payload: DeviceLinkError }).payload;
        setState({ phase: "claim_error", code: err?.code ?? "network_error" });
      } else {
        setState({ phase: "ready", userCode: urlCode });
      }
    };

    void doClaim();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the Approve button when the page transitions to "ready" after a
  // pre-filled claim (WCAG 2.2 AA — /link page focus management).
  // We target the <button> element inside the wrapper div because the Button
  // base component does not forward refs.
  useEffect(() => {
    if (state.phase === "ready" && urlCode) {
      const btn = approveWrapperRef.current?.querySelector<HTMLButtonElement>("button");
      btn?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleManualSubmit = async () => {
    if (state.phase !== "input") return;
    const code = state.userCode.trim();
    if (!code) return;

    setState({ phase: "claiming" });
    const action = await dispatch(claimCode(code));
    if ((action as { error?: unknown }).error) {
      const err = (action as { payload: DeviceLinkError }).payload;
      setState({ phase: "claim_error", code: err?.code ?? "network_error" });
    } else {
      setState({ phase: "ready", userCode: code });
    }
  };

  const handleApprove = async () => {
    if (state.phase !== "ready") return;
    const { userCode } = state;
    setState({ phase: "approving", userCode });
    const action = await dispatch(approveCode(userCode));
    if ((action as { error?: unknown }).error) {
      setState({
        phase: "ready",
        userCode,
        actionError: "An error occurred. Please try again.",
      });
    } else {
      setState({ phase: "approved" });
    }
  };

  const handleDecline = async () => {
    if (state.phase !== "ready") return;
    const { userCode } = state;
    setState({ phase: "declining", userCode });
    const action = await dispatch(denyCode(userCode));
    if ((action as { error?: unknown }).error) {
      setState({
        phase: "ready",
        userCode,
        actionError: "An error occurred. Please try again.",
      });
    } else {
      setState({ phase: "declined" });
    }
  };

  // ── Status message for aria-live region ────────────────────────────────────

  const statusText = (): string => {
    switch (state.phase) {
      case "claiming":
        return "Connecting…";
      case "approving":
        return "Approving…";
      case "declining":
        return "Declining…";
      case "approved":
        return "Desktop has been connected. The desktop app is now signed in as you.";
      case "declined":
        return "Connection declined.";
      case "claim_error":
        return claimErrorMessage(state.code);
      default:
        return "";
    }
  };

  // ── Terminal states ────────────────────────────────────────────────────────

  if (state.phase === "approved") {
    return (
      <MiddleOfPage>
        <Heading level={1} text="Lessons from Luke" />
        <div role="status" aria-live="polite">
          <Alert success>
            Desktop has been connected. The desktop app is now signed in as you.
          </Alert>
        </div>
      </MiddleOfPage>
    );
  }

  if (state.phase === "declined") {
    return (
      <MiddleOfPage>
        <Heading level={1} text="Lessons from Luke" />
        <div role="status" aria-live="polite">
          <Alert>Connection declined. The desktop was not connected.</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  if (state.phase === "claim_error") {
    return (
      <MiddleOfPage>
        <Heading level={1} text="Lessons from Luke" />
        <div role="status" aria-live="polite">
          <Alert danger>{claimErrorMessage(state.code)}</Alert>
        </div>
      </MiddleOfPage>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (state.phase === "claiming" || state.phase === "approving" || state.phase === "declining") {
    return (
      <MiddleOfPage>
        <Heading level={1} text="Lessons from Luke" />
        <div role="status" aria-live="polite">
          <LoadingSnake />
          <p>{statusText()}</p>
        </div>
      </MiddleOfPage>
    );
  }

  // ── Manual entry (no ?user_code) ────────────────────────────────────────────

  if (state.phase === "input") {
    return (
      <MiddleOfPage>
        <Heading level={1} text="Lessons from Luke" />
        <Heading level={3} text="Connect a desktop app" />
        <PDiv>
          <Label text="Pairing code, eight characters">
            <TextInput
              value={state.userCode}
              setValue={(v) => setState({ phase: "input", userCode: v })}
              placeholder="XXXX-XXXX"
              aria-label="Pairing code, eight characters"
              autoFocus
            />
          </Label>
          <HelpText>Enter the pairing code shown in the desktop app.</HelpText>
        </PDiv>
        <div role="status" aria-live="polite" />
        <Button text="Connect" onClick={handleManualSubmit} disabled={!state.userCode.trim()} />
      </MiddleOfPage>
    );
  }

  // ── Ready state: consent copy + Approve / Decline ─────────────────────────

  const { userCode, actionError } = state;
  const working = false; // phase is "ready" here

  return (
    <MiddleOfPage>
      <Heading level={1} text="Lessons from Luke" />

      {/* Security consent copy — required per plan.md §Security Considerations.
          The exact phrasing is a security control: it anchors the decision on
          the user's own intent ("did YOU start this on YOUR machine?") rather
          than on client_id trust, which is self-asserted. */}
      <PDiv>
        <Heading level={2} text="Connect a new desktop?" />
        <p>
          This lets that computer act as your account. Only continue if you started this on your own
          machine.
        </p>
      </PDiv>

      {actionError && (
        <div role="alert">
          <Alert danger>{actionError}</Alert>
        </div>
      )}

      {/* aria-live region for dynamic status announcements */}
      <div role="status" aria-live="polite" />

      <PDiv>
        {/* Wrapper div lets us focus the Approve button via querySelector
            (Button base component does not expose a forwardRef). */}
        <div ref={approveWrapperRef} style={{ display: "inline" }}>
          <Button text="Approve" onClick={handleApprove} disabled={working} />
        </div>
        <Button text="Decline" onClick={handleDecline} disabled={working} red />
      </PDiv>

      <HelpText>Code: {userCode}</HelpText>
    </MiddleOfPage>
  );
}
