/**
 * RED-phase stub for `ConfirmDialog` (lessons-from-luke-e044.5.4.6).
 *
 * Intentionally unimplemented: renders nothing regardless of `open`, has no
 * focus management, no keyboard handling, and no ARIA semantics. This lets
 * `ConfirmDialog.test.tsx` compile and run (satisfying `yarn typecheck`,
 * which re-includes `*.test.tsx` files) while every behavioral assertion in
 * that spec still fails at runtime — the correct RED failure mode.
 *
 * GREEN task lessons-from-luke-e044.5.4.7 replaces this stub with the real
 * focus-trap + ARIA dialog implementation.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null {
  if (!props.open) {
    return null;
  }
  return null;
}
