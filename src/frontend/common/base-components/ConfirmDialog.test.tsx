import React from "react";
import { useState } from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  const baseProps = {
    open: true,
    title: "Archive language?",
    message: "This will archive the language project.",
    confirmText: "Archive",
    cancelText: "Cancel",
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("moves focus into the dialog on mount when open", () => {
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("has correct ARIA semantics", () => {
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy as string);
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toBe(baseProps.title);
  });

  it("traps Tab focus within the dialog (does not escape to background elements)", () => {
    render(
      <div>
        <button>Outside</button>
        <ConfirmDialog {...baseProps} />
      </div>
    );
    const cancelButton = screen.getByText(baseProps.cancelText);
    const confirmButton = screen.getByText(baseProps.confirmText);

    // Shift+Tab from the first focusable element should wrap to the last.
    cancelButton.focus();
    fireEvent.keyDown(cancelButton, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirmButton);

    // Tab from the last focusable element should wrap to the first.
    confirmButton.focus();
    fireEvent.keyDown(confirmButton, { key: "Tab" });
    expect(document.activeElement).toBe(cancelButton);
  });

  it("calls onCancel when Escape is pressed", () => {
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when the confirm button is activated", () => {
    render(<ConfirmDialog {...baseProps} />);
    const confirmButton = screen.getByText(baseProps.confirmText);
    expect(confirmButton.tagName).toBe("BUTTON");
    fireEvent.click(confirmButton);
    expect(baseProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the cancel button is activated", () => {
    render(<ConfirmDialog {...baseProps} />);
    const cancelButton = screen.getByText(baseProps.cancelText);
    expect(cancelButton.tagName).toBe("BUTTON");
    fireEvent.click(cancelButton);
    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the triggering element when the dialog closes", () => {
    function Wrapper() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open dialog</button>
          <ConfirmDialog
            open={open}
            title={baseProps.title}
            message={baseProps.message}
            confirmText={baseProps.confirmText}
            cancelText={baseProps.cancelText}
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      );
    }

    render(<Wrapper />);
    const trigger = screen.getByText("Open dialog");
    trigger.focus();
    fireEvent.click(trigger);

    const cancelButton = screen.getByText(baseProps.cancelText);
    fireEvent.click(cancelButton);

    expect(document.activeElement).toBe(trigger);
  });
});
