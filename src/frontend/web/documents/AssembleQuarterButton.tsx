import React from "react";
import { Book } from "../../../core/models/Lesson";
import { PublicLanguage } from "../../../core/models/Language";
import Button from "../../common/base-components/Button";
import Div from "../../common/base-components/Div";
import Label from "../../common/base-components/Label";
import useAssembleQuarter, { AssembleMode } from "./useAssembleQuarter";

/**
 * "Assemble quarter" control (US1) — mirrors `GetDocumentButton`'s
 * button/loading-affordance pattern, driven by `useAssembleQuarter`'s
 * queued/running/ready/failed lifecycle.
 *
 * Scope note (per task): the happy-path click -> "Assembling…" -> download
 * wiring plus basic queued/running rendering. Full aria-live/focus polish
 * (US3) and richer blocked/failed UI (US4) are out of scope here.
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

  if (status.tag === "queued" || status.tag === "running") {
    return (
      <Div>
        <Label text="Assembling…" />
      </Div>
    );
  }

  if (status.tag === "failed") {
    return (
      <Div>
        <Label text={status.reason} />
        <Button link text={props.text} onClick={start} />
      </Div>
    );
  }

  return <Button link text={props.text} onClick={start} />;
}
