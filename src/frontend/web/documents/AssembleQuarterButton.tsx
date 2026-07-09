import React from "react";
import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";
import Label from "../../common/base-components/Label";
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
 * The failed-state focus/announce behavior belongs to US4 and is out of
 * scope here.
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

  if (status.tag === "failed") {
    return (
      <Div>
        <Label text={status.reason} />
        <Button link text={props.text} onClick={start} />
      </Div>
    );
  }

  const busy = status.tag === "queued" || status.tag === "running";
  const statusMessage =
    status.tag === "ready" ? "Ready — file downloaded." : busy ? "Assembling…" : null;

  return (
    <Div>
      {statusMessage !== null && <div role="status">{statusMessage}</div>}
      <Button
        link
        text={busy ? "Assembling…" : props.text}
        aria-label={props.text}
        aria-disabled={busy ? "true" : undefined}
        onClick={busy ? noop : start}
      />
    </Div>
  );
}
