import React, { useEffect, useId, useRef } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import Button from "./Button";
import Heading from "./Heading";
import P from "./P";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(28, 49, 68, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const DialogBox = styled.div`
  background-color: white;
  border: 1px solid ${Colors.lightGrey};
  border-radius: 0.25em;
  padding: 1.5em;
  max-width: 30em;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: 1em;
`;

export default function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null {
  const { open, title, message, confirmText, cancelText, onConfirm, onCancel } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const priorFocusRef = useRef<Element | null>(null);
  const headingId = useId();

  useEffect(() => {
    if (open) {
      priorFocusRef.current = document.activeElement;
      const firstButton = dialogRef.current?.querySelector<HTMLButtonElement>("button");
      firstButton?.focus();
    } else if (priorFocusRef.current instanceof HTMLElement) {
      priorFocusRef.current.focus();
      priorFocusRef.current = null;
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key !== "Tab") {
      return;
    }
    const focusable = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button");
    if (!focusable || focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DialogBoxWithRef = DialogBox as any;

  return (
    <Overlay>
      <DialogBoxWithRef
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
      >
        <div id={headingId}>
          <Heading level={3} text={title} style={{ margin: 0 }} />
        </div>
        <P>{message}</P>
        <ButtonRow>
          <Button text={cancelText} onClick={onCancel} link />
          <Button text={confirmText} onClick={onConfirm} red />
        </ButtonRow>
      </DialogBoxWithRef>
    </Overlay>
  );
}
