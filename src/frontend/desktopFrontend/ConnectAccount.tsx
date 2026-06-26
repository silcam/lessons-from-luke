import React, { useState, useEffect, useCallback, useRef } from "react";
import styled from "styled-components";
import { useDesktopAppSelector } from "./desktopAppState";
import Button from "../common/base-components/Button";
import P from "../common/base-components/P";
import Alert from "../common/base-components/Alert";
import Colors from "../common/util/Colors";
import {
  PAIRING_START,
  PAIRING_CANCEL,
  PAIRING_DISCONNECT,
  ON_PAIRING_ERROR,
  type PairingStartResult,
  type PairingErrorReason,
  type OnPairingErrorPayload,
} from "../../core/api/IpcChannels";

// ---------------------------------------------------------------------------
// Local state type — tracks the transient pairing handshake. The durable
// "paired" credential lives in Redux (desktopPairingSlice / state.desktopPairing).
// ---------------------------------------------------------------------------
type PairingFlowState =
  | { kind: "idle" }
  | { kind: "pairing"; userCode: string }
  | { kind: "error"; reason: PairingErrorReason };

// ---------------------------------------------------------------------------
// Styled primitives — typed for styled-components v5 compatibility
// ---------------------------------------------------------------------------

const CodeFieldWrapper = styled.div`
  margin: 0.5em 0;
`;

const StyledCodeInput = styled.input<React.InputHTMLAttributes<HTMLInputElement>>`
  font-size: 2em;
  letter-spacing: 0.15em;
  text-align: center;
  padding: 0.25em 0.5em;
  border: 1px solid ${Colors.lightGrey};
  border-radius: 0.25em;
  background-color: white;
  cursor: default;
  width: 100%;
  box-sizing: border-box;

  &:focus {
    outline: 2px solid ${Colors.primary};
    outline-offset: 2px;
  }
`;

const ActionRow = styled.div`
  margin-top: 0.75em;
  display: flex;
  gap: 0.5em;
  align-items: center;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Four-state desktop connect-to-account component:
 *   1. Idle       — not paired, no flow in progress
 *   2. Pairing    — XXXX-XXXX code displayed, waiting for browser approval
 *   3. Connected  — paired, shows user name + Disconnect
 *   4. Error      — code expired / declined / unexpected error + retry
 *
 * Accessibility contract (WCAG 2.2 AA):
 *   - Code field:       aria-label="Pairing code, eight characters" so screen
 *                       readers announce discrete characters, not the word.
 *   - Copy feedback:    aria-live="polite" region announces "Code copied".
 *   - Status changes:   aria-live="polite" (waiting → connected → expired).
 *   - Errors:           aria-live="assertive".
 */
export default function ConnectAccount(): React.ReactElement {
  const { paired, pairedUserName } = useDesktopAppSelector((state) => state.desktopPairing);

  const [flowState, setFlowState] = useState<PairingFlowState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cancelledRef mirrors wasCancelled for the stable IPC-listener closure;
  // wasCancelled is state so it can suppress the render-time paired check.
  const [wasCancelled, setWasCancelled] = useState(false);
  const cancelledRef = useRef(false);

  // Clear the copy-feedback timer on unmount to avoid state updates on an
  // unmounted component (unnecessary work; lint warning in strict React tooling).
  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    []
  );

  // Subscribe to pairing-error events pushed from the main process.
  // cancelledRef (not wasCancelled state) is used here so the closure remains
  // stable across renders without needing to re-subscribe.
  useEffect(() => {
    const unsub = window.electronAPI.on(ON_PAIRING_ERROR, (payload: OnPairingErrorPayload) => {
      if (!cancelledRef.current) {
        setFlowState({ kind: "error", reason: payload.reason });
      }
    });
    return unsub;
  }, []);

  // Auto-disconnect an orphaned session: if the background poll approved while
  // the user had already cancelled, invoke PAIRING_DISCONNECT and stay idle.
  // autoDisconnectingRef prevents repeated invocations across re-renders;
  // wasCancelled intentionally stays true until the next handleConnect so
  // the "Connected as…" branch never renders during the disconnect window.
  const autoDisconnectingRef = useRef(false);
  useEffect(() => {
    if (paired && wasCancelled && !autoDisconnectingRef.current) {
      autoDisconnectingRef.current = true;
      window.electronAPI.invoke(PAIRING_DISCONNECT).catch(() => {});
    }
    if (!paired) {
      autoDisconnectingRef.current = false;
    }
  }, [paired, wasCancelled]);

  const handleConnect = useCallback(async () => {
    setWasCancelled(false);
    cancelledRef.current = false;
    try {
      const result: PairingStartResult = await window.electronAPI.invoke(PAIRING_START);
      setFlowState({ kind: "pairing", userCode: result.userCode });
    } catch {
      setFlowState({ kind: "error", reason: "error" });
    }
  }, []);

  const handleCancel = useCallback(async () => {
    setWasCancelled(true);
    cancelledRef.current = true;
    await window.electronAPI.invoke(PAIRING_CANCEL);
    setFlowState({ kind: "idle" });
  }, []);

  const handleDisconnect = useCallback(async () => {
    // Reset local flow state synchronously before the IPC call so that when
    // Redux clears the paired flag (desktopPairing.paired) the component
    // renders Idle, not a stale Pairing screen.
    setFlowState({ kind: "idle" });
    await window.electronAPI.invoke(PAIRING_DISCONNECT);
  }, []);

  const handleCopy = useCallback(async () => {
    if (flowState.kind !== "pairing") return;
    await navigator.clipboard.writeText(flowState.userCode);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [flowState]);

  const handleRetry = useCallback(() => {
    setFlowState({ kind: "idle" });
  }, []);

  // --- Connected ---
  // Suppress "Connected as..." when the session was approved after user cancel;
  // the auto-disconnect useEffect above will clear it momentarily.
  if (paired && !wasCancelled) {
    return (
      <div>
        <div aria-live="polite">
          <P>Connected as {pairedUserName}</P>
        </div>
        <Button text="Disconnect" onClick={handleDisconnect} />
      </div>
    );
  }

  // --- Pairing in progress ---
  if (flowState.kind === "pairing") {
    return (
      <div>
        <div aria-live="polite">
          <P>Waiting for browser approval...</P>
          <CodeFieldWrapper>
            <StyledCodeInput
              readOnly
              value={flowState.userCode}
              aria-label="Pairing code, eight characters"
              tabIndex={0}
            />
          </CodeFieldWrapper>
        </div>
        <ActionRow>
          <Button text="Copy code" onClick={handleCopy} />
          <Button text="Cancel" onClick={handleCancel} />
        </ActionRow>
        {/* Polite live region for clipboard feedback — always present so screen
            readers track it; empty when not recently copied. */}
        <div aria-live="polite" aria-atomic="true">
          {copied ? "Code copied" : ""}
        </div>
      </div>
    );
  }

  // --- Error ---
  if (flowState.kind === "error") {
    const message =
      flowState.reason === "expired"
        ? "The pairing code expired. Please try again."
        : flowState.reason === "declined"
          ? "Pairing was declined. Please try again."
          : "Something went wrong. Please try again.";

    return (
      <div>
        <div aria-live="assertive" role="alert">
          <Alert danger>
            <P>{message}</P>
          </Alert>
        </div>
        <Button text="Try again" onClick={handleRetry} />
      </div>
    );
  }

  // --- Idle ---
  return (
    <div>
      <Button text="Connect to account" onClick={handleConnect} />
    </div>
  );
}
