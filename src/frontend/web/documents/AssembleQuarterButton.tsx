import React, { useEffect, useRef } from "react";
import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";
import Alert from "../../common/base-components/Alert";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";
import useAssembleQuarter, { AssembleMode } from "./useAssembleQuarter";

const noop = () => {
  /* intentionally does nothing — the control is aria-disabled while a job
     is queued/running, so a stray click must not restart it. */
};

/**
 * "Assemble quarter" control — mirrors `GetDocumentButton`'s button/loading-
 * affordance pattern, driven by `useAssembleQuarter`'s
 * queued/running/ready/failed lifecycle.
 *
 * Accessibility (US3): the "Assembling…" indicator lives in a `role="status"`
 * region (implicit `aria-live="polite"`) rather than a purely visual spinner,
 * so a screen-reader user hears progress. The control keeps its accessible
 * name (`props.text`, via `aria-label`) and uses `aria-disabled` — never the
 * `disabled` attribute — while busy, so it stays focusable and announced
 * instead of dropping out of the tab order. On transition to `ready` the
 * live region announces that the download completed (the auto-download
 * itself is otherwise silent to a screen-reader user).
 *
 * Layout: the idle/busy/ready path renders inline (a `span` status region
 * next to the `Button`, no block wrapper) so a "Bilingual | Single-Language"
 * pair sits on one line inside `LanguageView`'s table cell, matching
 * `GetDocumentButton`'s inline flow — a block `Div` here would force each
 * button onto its own line and orphan the `" | "` separator between them.
 *
 * Failed state (US4): the failure reason is rendered in a `tabIndex={-1}`
 * `Alert danger` (DESIGN.md's color-carries-meaning rule — Danger Red is the
 * only state color that clears AA contrast for text, so it's the one used to
 * carry meaning here) so it can receive programmatic focus; on transition to
 * `failed` the component moves focus there, making the reason reliably
 * discoverable without a visual scan (screen readers announce the focused
 * content). Retry re-uses the normal `start()` action — clicking the button
 * again simply re-triggers assembly via a fresh POST.
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

  useEffect(() => {
    if (status.tag === "failed") {
      failureMessageRef.current?.focus();
    }
  }, [status.tag]);

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

  const busy = status.tag === "queued" || status.tag === "running";
  const statusMessage =
    status.tag === "ready" ? "Ready — file downloaded." : busy ? "Assembling…" : null;

  return (
    <React.Fragment>
      {statusMessage !== null && <span role="status">{statusMessage}</span>}
      <Button
        link
        text={busy ? "Assembling…" : props.text}
        aria-label={props.text}
        aria-disabled={busy ? "true" : undefined}
        onClick={busy ? noop : start}
      />
    </React.Fragment>
  );
}
