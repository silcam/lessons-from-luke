import React, { useEffect, useRef } from "react";
import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";
import Alert from "../../common/base-components/Alert";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";
import InlineSpinner from "../../common/base-components/InlineSpinner";
import useAssembleQuarter, { AssembleMode } from "./useAssembleQuarter";

/**
 * "Assemble quarter" control — mirrors `GetDocumentButton`'s button/loading-
 * affordance pattern, driven by `useAssembleQuarter`'s
 * queued/running/ready/failed lifecycle.
 *
 * Accessibility (US3): the "Assembling…" indicator lives in a `role="status"`
 * region (implicit `aria-live="polite"`) rather than a purely visual spinner,
 * so a screen-reader user hears progress. While a job is queued/running the
 * button is replaced by that region — the earlier design kept an
 * `aria-disabled` button alongside it, which rendered "Assembling…" twice and
 * left a dead-looking link in the row. Because unmounting the button would
 * otherwise drop keyboard focus to `<body>`, the status region is
 * `tabIndex={-1}` and takes focus on the idle→busy edge; focus returns to the
 * restored button on the busy→ready edge. The status region stays at the same
 * position in the fragment across both states so React reuses the node and the
 * live region announces the `ready` text change (the auto-download is
 * otherwise silent to a screen-reader user).
 *
 * Layout: the idle/busy/ready path renders inline (a `span` status region
 * next to the `Button`, no block wrapper) so a "Bilingual | Single-Language"
 * pair sits on one line inside `LanguageView`'s table cell, matching
 * `GetDocumentButton`'s inline flow — a block `Div` here would force each
 * button onto its own line and orphan the `" | "` separator between them. The
 * `Button` sits inside an inline `span` only because `Button` doesn't forward
 * a ref — the wrapper is what the busy→ready focus restore reaches through.
 *
 * Failed state (US4): the failure reason is rendered in a `tabIndex={-1}`
 * `Alert danger` (DESIGN.md's color-carries-meaning rule — Danger Red is the
 * only state color that clears AA contrast for text, so it's the one used to
 * carry meaning here) so it can receive programmatic focus; on transition to
 * `failed` the component moves focus there, making the reason reliably
 * discoverable without a visual scan (screen readers announce the focused
 * content). Retry re-uses the normal `start()` action — clicking the button
 * again simply re-triggers assembly via a fresh POST.
 *
 * Rejected state (a `429` — contract §1: "MUST NOT be rendered as a terminal
 * `failed` job"): the reason shares the ordinary `role="status"` region
 * rather than getting a presentation of its own, and `busy` stays false, so
 * this is the one state where the status region and the button are mounted at
 * the same time — which is exactly the contract's "the client simply re-POSTs
 * after a delay". Three consequences, all deliberate:
 *
 * - It is announced politely instead of seizing focus. The user's focus is
 *   still on the button they just pressed, so they press Enter again. Both
 *   focus effects above are edge-guarded on `busy`, which never changes here
 *   (false → false), so neither fires and nothing is stolen.
 * - It stays inline, unlike the `failed` branch's block `Div`, so a
 *   "Bilingual | Single-Language" pair keeps sharing a line in `LanguageView`'s
 *   table cell.
 * - It is not an `Alert`. A bare `<Alert>` (no `danger`/`success`) sets amber
 *   `Colors.highlight` body text, which `Alert.tsx` itself records as failing
 *   WCAG AA — and `Alert danger` would say "this is broken" about the most
 *   transient condition there is.
 */
export default function AssembleQuarterButton(props: {
  language: PublicLanguage;
  book: Book;
  series: number;
  mode: AssembleMode;
  text: string;
}) {
  const { status, start } = useAssembleQuarter(
    props.language,
    props.book,
    props.series,
    props.mode
  );

  const failureMessageRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const buttonWrapRef = useRef<HTMLSpanElement>(null);

  const busy = status.tag === "queued" || status.tag === "running";
  const wasBusy = useRef(busy);

  useEffect(() => {
    if (status.tag === "failed") {
      failureMessageRef.current?.focus();
    }
  }, [status.tag]);

  // Edge-triggered, not state-triggered: `queued → running` changes the tag
  // while `busy` stays true, and re-focusing there would steal focus from
  // whatever the user has tabbed to (e.g. the sibling mode's link).
  //
  // Both edges are additionally guarded on "focus is still where we left it".
  // The goal is to avoid *stranding* focus, never to grab it: assembly can run
  // for minutes, and the user may well have started the other mode in the same
  // row or moved elsewhere on the page in the meantime.
  useEffect(() => {
    if (busy === wasBusy.current) return;
    wasBusy.current = busy;
    if (busy) {
      // Unmounting the button drops focus to `<body>`; anything else means the
      // user has moved on and we must leave them alone.
      if (document.activeElement === null || document.activeElement === document.body) {
        statusRef.current?.focus();
      }
    } else if (document.activeElement === statusRef.current) {
      // The status span node is reused across busy → ready, so this identity
      // check is exact: focus is still on the region we put it on.
      buttonWrapRef.current?.querySelector("button")?.focus();
    }
  }, [busy]);

  if (status.tag === "failed") {
    return (
      <Div>
        <Alert danger>
          <span ref={failureMessageRef} tabIndex={-1}>
            {`Couldn't assemble: ${status.reason}`}
          </span>
        </Alert>
        <Button link text={props.text} onClick={start} />
      </Div>
    );
  }

  const statusMessage =
    status.tag === "ready"
      ? "Ready — file downloaded."
      : status.tag === "rejected"
        ? status.reason
        : busy
          ? "Assembling…"
          : null;

  return (
    <React.Fragment>
      {statusMessage !== null && (
        <span role="status" tabIndex={-1} ref={statusRef}>
          {busy && <InlineSpinner />}
          {busy && " "}
          {statusMessage}
        </span>
      )}
      {!busy && (
        <span ref={buttonWrapRef}>
          <Button link text={props.text} onClick={start} />
        </span>
      )}
    </React.Fragment>
  );
}
